import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Session from "supertokens-auth-react/recipe/session";
import { m } from "@/paraglide/messages";
import "./admin.css";
import RegistrationList from "./RegistrationList";
import RegistrationDetail from "./RegistrationDetail";
import LayoutEditor from "./LayoutEditor";
import TableTypeManagement from "./TableTypeManagement";
import VenueManagement from "./VenueManagement";
import { ContentSection, EditionsSection } from "./ContentManagement";
import type { ItemDraft } from "./itemTypes";
import PeopleManagement from "./PeopleManagement";
import MembersManagement from "./MembersManagement";
import VolunteersManagement from "./VolunteersManagement";
import AdminSidebar from "./AdminSidebar";
import AdminLoginForm from "./AdminLoginForm";
import type { MemberFormData } from "./MemberFormModal";
import type { PersonFormData } from "./PersonFormModal";
import type { VolunteerFormData } from "./VolunteerFormModal";
import type {
  Registration,
  RegistrationStatus,
  PaymentStatus,
  OrderItem,
} from "@/types/registration";
import { apiToRegistration } from "@/types/registrationMapper";
import type { Room, FloorTable, FloorArea, TableType, Layout, Venue } from "@/types/admin";
import { type Person, apiToPerson } from "@/types/person";
import { activeEditionQueryKey, useActiveEdition } from "@/hooks/useActiveEdition";
import { useAdminQueries } from "@/hooks/useAdminQueries";
import {
  fetchJsonOrThrowWithUnauthorized,
  fetchVoidOrThrowWithUnauthorized,
} from "@/utils/adminApi";
import { queryKeys } from "@/utils/queryKeys";
import { getAreaSizePx, getCanvasSizePx } from "@/utils/layoutUtils";
import { devError } from "@/utils/devLog";
import {
  apiVenueToVenue,
  apiLayoutToLayout,
  apiTableTypeToTableType,
  apiRoomToRoom,
  apiTableToTable,
  apiAreaToArea,
  mergeVolunteerPerson,
  replacePersonById,
  replaceVolunteerById,
  syncMembersWithPerson,
} from "@/utils/adminApiMappers";
import Card from "react-bootstrap/Card";

interface AdminDashboardProps {
  visible: boolean;
}

export default function AdminDashboard({ visible }: AdminDashboardProps) {
  const { edition: activeEdition } = useActiveEdition();
  const queryClient = useQueryClient();
  const sessionContext = Session.useSessionContext();
  const navRef = useRef<HTMLElement>(null);

  const isAuthenticated = !sessionContext.loading && sessionContext.doesSessionExist;
  const isSessionLoading = sessionContext.loading;
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  /** Full registration (with checkInToken) shown in the detail modal */
  const [detailRegistration, setDetailRegistration] = useState<Registration | null>(null);

  // Sidebar navigation state
  const [activeKey, setActiveKey] = useState("registrations");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(["programme"]));
  const [venueTab, setVenueTab] = useState<"venues" | "table-types">("venues");
  const [peopleTab, setPeopleTab] = useState<"directory" | "members" | "volunteers">("directory");
  const [contentTab, setContentTab] = useState<"exhibitors" | "editions">("exhibitors");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const authHeaders = useCallback(() => ({}) as Record<string, string>, []);

  const {
    registrationsQuery,
    tablesQuery,
    venuesQuery,
    roomsQuery,
    tableTypesQuery,
    layoutsQuery,
    exhibitorsQuery,
    areasQuery,
    peopleQuery,
    membersQuery,
    isAnyPending,
    isAnyFetching,
    registrationsQueryKey,
    tablesQueryKey,
    venuesQueryKey,
    roomsQueryKey,
    tableTypesQueryKey,
    layoutsQueryKey,
    exhibitorsQueryKey,
    areasQueryKey,
    peopleQueryKey,
    membersQueryKey,
    layoutDayOptions,
    loadData: loadDataBase,
  } = useAdminQueries({
    visible,
    isAuthenticated,
    authHeaders,
    activeEdition,
  });

  const loadData = useCallback(async () => {
    setError("");
    await loadDataBase();
  }, [loadDataBase]);

  const registrations = registrationsQuery.data ?? [];
  const tables = tablesQuery.data ?? [];
  const venues = venuesQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const tableTypes = tableTypesQuery.data ?? [];
  const layouts = layoutsQuery.data ?? [];
  const exhibitors = exhibitorsQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const people = peopleQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const mergePeopleMutation = useMutation({
    mutationFn: ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${canonicalId}/merge/${duplicateId}`,
        { method: "POST", headers: authHeaders() },
        m.admin_people_merge_error(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: registrationsQueryKey });
      void queryClient.invalidateQueries({ queryKey: exhibitorsQueryKey });
    },
    retry: false,
  });

  const createMemberMutation = useMutation({
    mutationFn: (data: MemberFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/members",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_create(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
    },
    retry: false,
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemberFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/members/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            club_name: data.clubName,
            notes: data.notes,
            active: data.active,
          }),
        },
        m.admin_members_error_update(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: registrationsQueryKey });
    },
    retry: false,
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/members/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_members_error_delete(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
    },
    retry: false,
  });

  const createPersonMutation = useMutation({
    mutationFn: (data: PersonFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/people",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_create(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
    },
    retry: false,
  });

  const updatePersonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PersonFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/people/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            email: data.email || null,
            phone: data.phone,
            address: data.address,
            roles: data.roles,
            notes: data.notes,
            club_name: data.clubName,
            active: data.active,
          }),
        },
        m.admin_people_error_update(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
      void queryClient.invalidateQueries({ queryKey: registrationsQueryKey });
    },
    retry: false,
  });

  const deletePersonMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/people/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_person(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
    },
    retry: false,
  });

  const createVolunteerMutation = useMutation({
    mutationFn: (data: VolunteerFormData) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/volunteers",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
            })),
          }),
        },
        m.admin_volunteers_error_create(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
    },
    retry: false,
  });

  const updateVolunteerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VolunteerFormData }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/volunteers/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            address: data.address,
            national_register_number: data.nationalRegisterNumber,
            eid_document_number: data.eidDocumentNumber,
            active: data.active,
            help_periods: data.helpPeriods.map((period) => ({
              first_help_day: period.firstHelpDay,
              last_help_day: period.lastHelpDay,
            })),
          }),
        },
        m.admin_volunteers_error_update(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
    },
    retry: false,
  });

  const deleteVolunteerMutation = useMutation({
    mutationFn: (id: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/volunteers/${id}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_volunteers_error_delete(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: peopleQueryKey });
      void queryClient.invalidateQueries({ queryKey: membersQueryKey });
    },
    retry: false,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: ({
      id,
      payload,
      fallbackMessage,
    }: {
      id: string;
      payload: Record<string, unknown>;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/registrations/${id}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) },
        fallbackMessage,
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: registrationsQueryKey });
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const createTableMutation = useMutation({
    mutationFn: ({
      name,
      capacity,
      layoutId,
      tableTypeId,
      x,
      y,
      rotation,
    }: {
      name: string;
      capacity: number;
      layoutId: string;
      tableTypeId: string;
      x?: number;
      y?: number;
      rotation?: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/tables",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name,
            capacity,
            x: x ?? 10,
            y: y ?? 10,
            rotation: rotation ?? 0,
            layout_id: layoutId,
            table_type_id: tableTypeId,
          }),
        },
        m.admin_error_add_table(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const changeTableTypeMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; tableTypeId: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, tableTypeId }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ table_type_id: tableTypeId }),
        },
        m.admin_error_change_table_type_status({ status: 500 }),
      ),
    onMutate: ({ tableId, tableTypeId }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, tableTypeId } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const updateTableNameMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; name: string },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, name }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ name }) },
        m.admin_error_update_table_name_status({ status: 500 }),
      ),
    onMutate: ({ tableId, name }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, name } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const moveTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; x: number; y: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        m.admin_error_persist_table_position(),
      ),
    onMutate: ({ tableId, x, y }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, x, y } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
      devError("Failed to persist table position");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const rotateTableMutation = useMutation<
    Record<string, unknown>,
    Error,
    { tableId: string; rotation: number },
    { previousTables: FloorTable[] | undefined }
  >({
    mutationFn: ({ tableId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/tables/${tableId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        m.admin_error_persist_table_rotation(),
      ),
    onMutate: ({ tableId, rotation }) => {
      const previousTables = queryClient.getQueryData<FloorTable[]>(tablesQueryKey);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (old) =>
        old ? old.map((t) => (t.id === tableId ? { ...t, rotation } : t)) : old,
      );
      return { previousTables };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTables) queryClient.setQueryData(tablesQueryKey, context.previousTables);
      devError("Failed to persist table rotation");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/tables/${tableId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_table(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
    },
    retry: false,
  });

  const createVenueMutation = useMutation({
    mutationFn: ({
      name,
      address,
      city,
      postalCode,
      country,
    }: {
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/venues",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name, address, city, postal_code: postalCode, country }),
        },
        m.admin_error_add_venue(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: venuesQueryKey });
    },
    retry: false,
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ venueId, active }: { venueId: string; active: boolean }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/venues/${venueId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        active ? m.admin_error_restore_venue() : m.admin_error_archive_venue(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: venuesQueryKey });
    },
    retry: false,
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (venueId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/venues/${venueId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_venue(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: venuesQueryKey });
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey });
      void queryClient.invalidateQueries({ queryKey: layoutsQueryKey });
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const createRoomMutation = useMutation({
    mutationFn: ({
      venueId,
      name,
      widthM,
      lengthM,
      color,
    }: {
      venueId: string;
      name: string;
      widthM: number;
      lengthM: number;
      color: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/rooms",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            venue_id: venueId,
            name,
            width_m: widthM,
            length_m: lengthM,
            color,
          }),
        },
        m.admin_error_add_room(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey });
    },
    retry: false,
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({
      roomId,
      active,
      fallbackMessage,
    }: {
      roomId: string;
      active: boolean;
      fallbackMessage: string;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/rooms/${roomId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ active }) },
        fallbackMessage,
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey });
    },
    retry: false,
  });

  const createLayoutMutation = useMutation({
    mutationFn: ({ roomId, date, label }: { roomId: string; date: string; label?: string }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/layouts",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            edition_id: activeEdition.id,
            room_id: roomId,
            date,
            ...(label?.trim() ? { label: label.trim() } : {}),
          }),
        },
        m.admin_error_add_layout(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layoutsQueryKey });
    },
    retry: false,
  });

  const deleteLayoutMutation = useMutation({
    mutationFn: (layoutId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/layouts/${layoutId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_layout(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layoutsQueryKey });
      void queryClient.invalidateQueries({ queryKey: tablesQueryKey });
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const createAreaMutation = useMutation({
    mutationFn: ({
      label,
      icon,
      layoutId,
      widthM,
      lengthM,
      exhibitorId,
      x,
      y,
      rotation,
    }: {
      label: string;
      icon: string;
      layoutId: string;
      widthM: number;
      lengthM: number;
      exhibitorId?: number;
      x?: number;
      y?: number;
      rotation?: number;
    }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/areas",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            label,
            icon,
            layout_id: layoutId,
            width_m: widthM,
            length_m: lengthM,
            x: x ?? 10,
            y: y ?? 10,
            rotation: rotation ?? 0,
            exhibitor_id: exhibitorId ?? null,
          }),
        },
        m.admin_error_add_area(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const updateAreaLabelMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; label: string },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, label }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ label }) },
        "Failed to persist area label.",
      ),
    onMutate: ({ areaId, label }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, label } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area label");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const resizeAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; widthM: number; lengthM: number; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, widthM, lengthM, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ width_m: widthM, length_m: lengthM, x, y }),
        },
        m.admin_error_resize_area_status({ status: 500 }),
      ),
    onMutate: ({ areaId, widthM, lengthM, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, widthM, lengthM, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area resize");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const assignAreaMutation = useMutation({
    mutationFn: ({ areaId, body }: { areaId: string; body: Record<string, unknown> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) },
        "Failed to assign area.",
      ),
    onSuccess: (
      d: Record<string, unknown>,
      { areaId }: { areaId: string; body: Record<string, unknown> },
    ) => {
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.map((a) => (a.id === areaId ? apiAreaToArea(d) : a)) : prev,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const moveAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; x: number; y: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, x, y }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ x, y }) },
        m.admin_error_persist_area_position(),
      ),
    onMutate: ({ areaId, x, y }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, x, y } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area position");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const rotateAreaMutation = useMutation<
    Record<string, unknown>,
    Error,
    { areaId: string; rotation: number },
    { previousAreas: FloorArea[] | undefined }
  >({
    mutationFn: ({ areaId, rotation }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/areas/${areaId}`,
        { method: "PUT", headers: authHeaders(), body: JSON.stringify({ rotation }) },
        m.admin_error_persist_area_rotation(),
      ),
    onMutate: ({ areaId, rotation }) => {
      const previousAreas = queryClient.getQueryData<FloorArea[]>(areasQueryKey);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (old) =>
        old ? old.map((a) => (a.id === areaId ? { ...a, rotation } : a)) : old,
      );
      return { previousAreas };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAreas) queryClient.setQueryData(areasQueryKey, context.previousAreas);
      devError("Failed to persist area rotation");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      fetchVoidOrThrowWithUnauthorized(
        `/api/areas/${areaId}`,
        { method: "DELETE", headers: authHeaders() },
        m.admin_error_delete_area(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areasQueryKey });
    },
    retry: false,
  });

  const createTableTypeMutation = useMutation({
    mutationFn: (data: Omit<TableType, "id">) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        "/api/table-types",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: data.name,
            shape: data.shape,
            width_m: data.widthM,
            length_m: data.lengthM,
            height_type: data.heightType,
            max_capacity: data.maxCapacity,
          }),
        },
        m.admin_error_add_table_type(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tableTypesQueryKey });
    },
    retry: false,
  });

  const updateTableTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<TableType, "id">> }) =>
      fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/table-types/${id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.shape !== undefined && { shape: data.shape }),
            ...(data.widthM !== undefined && { width_m: data.widthM }),
            ...(data.lengthM !== undefined && { length_m: data.lengthM }),
            ...(data.heightType !== undefined && { height_type: data.heightType }),
            ...(data.maxCapacity !== undefined && { max_capacity: data.maxCapacity }),
            ...(data.active !== undefined && { active: data.active }),
          }),
        },
        m.admin_error_update_table_type(),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tableTypesQueryKey });
    },
    retry: false,
  });

  const handleLogout = useCallback(async () => {
    try {
      await Session.signOut();
    } catch {
      // Sign-out may fail (network error, etc.); always clean up local state.
    } finally {
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "admin";
        },
      });
      setDetailRegistration(null);
    }
  }, [queryClient]);

  const handleMergePeople = useCallback(
    async (canonicalId: string, duplicateId: string) => {
      const updated = await mergePeopleMutation.mutateAsync({ canonicalId, duplicateId });
      const canonicalPerson = apiToPerson(updated as Record<string, unknown>);
      const currentPeople = peopleQuery.data ?? [];
      const duplicate = currentPeople.find((p) => p.id === duplicateId);
      const existingCanonical = currentPeople.find((p) => p.id === canonicalId);
      const shouldPreserveVolunteerData =
        canonicalPerson.roles.includes("volunteer") ||
        existingCanonical?.roles.includes("volunteer") ||
        duplicate?.roles.includes("volunteer");
      const mergedCanonical = shouldPreserveVolunteerData
        ? mergeVolunteerPerson(existingCanonical, {
            ...canonicalPerson,
            helpPeriods: existingCanonical?.helpPeriods ?? duplicate?.helpPeriods ?? [],
          })
        : canonicalPerson;
      // Replace both the canonical and duplicate in the canonical people list.
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev
              .filter((p) => p.id !== duplicateId)
              .map((p) => (p.id === canonicalId ? mergedCanonical : p))
          : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? syncMembersWithPerson(
              prev.filter((member) => member.id !== duplicateId),
              mergedCanonical,
            )
          : prev,
      );
      // Re-point any registrations in state that were on the duplicate;
      // also refresh person data on any already-canonical registrations (merged fields may have changed).
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === duplicateId
                ? { ...r, personId: canonicalId, person: canonicalPerson }
                : r.personId === canonicalId
                  ? { ...r, person: canonicalPerson }
                  : r,
            )
          : prev,
      );
      // Re-point any exhibitors in state that were linked to the duplicate contact person
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) =>
        prev
          ? prev.map((ex) =>
              ex.contactPersonId === duplicateId ? { ...ex, contactPersonId: canonicalId } : ex,
            )
          : prev,
      );
    },
    [
      exhibitorsQueryKey,
      membersQueryKey,
      mergePeopleMutation,
      peopleQuery.data,
      peopleQueryKey,
      queryClient,
      registrationsQueryKey,
    ],
  );

  const handleCreateMember = useCallback(
    async (data: MemberFormData) => {
      const d = await createMemberMutation.mutateAsync(data);
      const createdMember = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdMember, ...prev] : [createdMember],
      );
    },
    [createMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdateMember = useCallback(
    async (id: string, data: MemberFormData) => {
      const d = await updateMemberMutation.mutateAsync({ id, data });
      const updatedMember = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.map((member) => (member.id === id ? updatedMember : member)) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updatedMember) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === id
                ? {
                    ...r,
                    person: {
                      id: updatedMember.id,
                      name: updatedMember.name,
                      email: updatedMember.email,
                      phone: updatedMember.phone,
                    },
                  }
                : r,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updatedMember.id,
                name: updatedMember.name,
                email: updatedMember.email,
                phone: updatedMember.phone,
              },
            }
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, registrationsQueryKey, updateMemberMutation],
  );

  const handleDeleteMember = useCallback(
    async (id: string) => {
      await deleteMemberMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((person) => person.id !== id) : prev,
      );
    },
    [deleteMemberMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreatePerson = useCallback(
    async (data: PersonFormData) => {
      const d = await createPersonMutation.mutateAsync(data);
      const createdPerson = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [createdPerson, ...prev] : [createdPerson],
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, createdPerson) : prev,
      );
    },
    [createPersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleUpdatePerson = useCallback(
    async (id: string, data: PersonFormData) => {
      const d = await updatePersonMutation.mutateAsync({ id, data });
      const updated = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replacePersonById(prev, updated) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? syncMembersWithPerson(prev, updated) : prev,
      );
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev
          ? prev.map((r) =>
              r.personId === id
                ? {
                    ...r,
                    person: {
                      id: updated.id,
                      name: updated.name,
                      email: updated.email,
                      phone: updated.phone,
                    },
                  }
                : r,
            )
          : prev,
      );
      setDetailRegistration((prev) =>
        prev?.person.id === id
          ? {
              ...prev,
              person: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                phone: updated.phone,
              },
            }
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, registrationsQueryKey, updatePersonMutation],
  );

  const handleDeletePerson = useCallback(
    async (id: string) => {
      await deletePersonMutation.mutateAsync(id);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? prev.filter((p) => p.id !== id) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev ? prev.filter((member) => member.id !== id) : prev,
      );
    },
    [deletePersonMutation, membersQueryKey, peopleQueryKey, queryClient],
  );

  const handleCreateVolunteer = useCallback(
    async (data: VolunteerFormData) => {
      const d = await createVolunteerMutation.mutateAsync(data);
      const createdVolunteer = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? [mergeVolunteerPerson(undefined, createdVolunteer), ...prev] : prev,
      );
    },
    [createVolunteerMutation, peopleQueryKey, queryClient],
  );

  const handleUpdateVolunteer = useCallback(
    async (id: string, data: VolunteerFormData) => {
      const d = await updateVolunteerMutation.mutateAsync({ id, data });
      const updatedVolunteer = apiToPerson(d as Record<string, unknown>);
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev ? replaceVolunteerById(prev, updatedVolunteer) : prev,
      );
      queryClient.setQueryData<Person[]>(membersQueryKey, (prev) =>
        prev
          ? prev.map((member) =>
              member.id === id
                ? {
                    ...member,
                    name: updatedVolunteer.name,
                    address: updatedVolunteer.address,
                    active: updatedVolunteer.active,
                    updatedAt: updatedVolunteer.updatedAt,
                  }
                : member,
            )
          : prev,
      );
    },
    [membersQueryKey, peopleQueryKey, queryClient, updateVolunteerMutation],
  );

  const handleDeleteVolunteer = useCallback(
    async (id: string) => {
      await deleteVolunteerMutation.mutateAsync(id);
      // The person record is preserved (soft archive); only the volunteer role
      // and help periods are removed.  Update local state accordingly so that
      // the person remains visible in People/Members tabs if applicable.
      queryClient.setQueryData<Person[]>(peopleQueryKey, (prev) =>
        prev
          ? prev.map((person) =>
              person.id !== id
                ? person
                : {
                    ...person,
                    roles: person.roles.filter((r) => r !== "volunteer"),
                    helpPeriods: [],
                  },
            )
          : prev,
      );
    },
    [deleteVolunteerMutation, peopleQueryKey, queryClient],
  );

  const handleExhibitorSaved = useCallback(
    (item: ItemDraft) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => {
        const entry = {
          id: item.id,
          name: item.name,
          active: item.active ?? true,
          contactPersonId: item.contactPersonId ?? null,
        };
        if (!prev) return prev;
        const idx = prev.findIndex((e) => e.id === item.id);
        if (idx >= 0) {
          return prev.map((e) => (e.id === item.id ? entry : e));
        }
        return [...prev, entry];
      });
    },
    [exhibitorsQueryKey, queryClient],
  );

  const handleExhibitorDeleted = useCallback(
    (id: number) => {
      queryClient.setQueryData<
        { id: number; name: string; active: boolean; contactPersonId: string | null }[]
      >(exhibitorsQueryKey, (prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    },
    [exhibitorsQueryKey, queryClient],
  );

  const volunteers = useMemo(
    () => (peopleQuery.data ?? []).filter((person) => person.roles.includes("volunteer")),
    [peopleQuery.data],
  );

  useEffect(() => {
    const errors = [
      registrationsQuery.error,
      tablesQuery.error,
      venuesQuery.error,
      roomsQuery.error,
      tableTypesQuery.error,
      layoutsQuery.error,
      exhibitorsQuery.error,
      areasQuery.error,
      peopleQuery.error,
      membersQuery.error,
    ];

    const unauthorizedError = errors.find(
      (e) => e instanceof Error && e.message === "unauthorized",
    );
    if (unauthorizedError) {
      handleLogout().catch((err) => devError("Logout failed", err));
      return;
    }

    const firstError = errors.find((e) => e !== null);
    if (firstError) {
      devError("Failed to load dashboard data", firstError);
      setError(m.admin_error_load_data());
    } else {
      // All queries succeeded or are still loading — clear any previous error.
      setError("");
    }
  }, [
    registrationsQuery.error,
    tablesQuery.error,
    venuesQuery.error,
    roomsQuery.error,
    tableTypesQuery.error,
    layoutsQuery.error,
    exhibitorsQuery.error,
    areasQuery.error,
    peopleQuery.error,
    membersQuery.error,
    handleLogout,
  ]);

  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!navRef.current) return;
    const buttons = Array.from(
      navRef.current.querySelectorAll<HTMLButtonElement>("button.admin-nav-item, button.admin-nav-group-header"),
    );
    const focused = document.activeElement;
    const idx = buttons.indexOf(focused as HTMLButtonElement);
    if (idx === -1) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }, []);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const handleUpdateStatus = useCallback(
    async (id: string, status: RegistrationStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { status },
            fallbackMessage: m.admin_error_update_registration(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === id ? { ...r, status: updated.status, updatedAt: updated.updatedAt } : r,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, status: updated.status, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to update registration status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_registration());
        throw err;
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleUpdatePayment = useCallback(
    async (id: string, paymentStatus: PaymentStatus) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id,
            payload: { payment_status: paymentStatus },
            fallbackMessage: m.admin_error_update_payment(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === id
                  ? { ...r, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt }
                  : r,
              )
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === id
            ? { ...prev, paymentStatus: updated.paymentStatus, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to update payment status", err);
        setError(err instanceof Error ? err.message : m.admin_error_update_payment());
        throw err;
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleAssignTable = useCallback(
    async (registrationId: string, tableId: string | undefined) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { table_id: tableId ?? null },
            fallbackMessage: m.admin_error_assign_table(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev
            ? prev.map((r) =>
                r.id === registrationId
                  ? { ...r, tableId: updated.tableId, updatedAt: updated.updatedAt }
                  : r,
              )
            : prev,
        );
        queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
          prev
            ? prev.map((t) => {
                const wasAssigned = t.registrationIds.includes(registrationId);
                const shouldBeAssigned = t.id === updated.tableId;
                if (wasAssigned && !shouldBeAssigned) {
                  return {
                    ...t,
                    registrationIds: t.registrationIds.filter((id) => id !== registrationId),
                  };
                }
                if (!wasAssigned && shouldBeAssigned) {
                  return { ...t, registrationIds: [...t.registrationIds, registrationId] };
                }
                return t;
              })
            : prev,
        );
        setDetailRegistration((prev) =>
          prev?.id === registrationId
            ? { ...prev, tableId: updated.tableId, updatedAt: updated.updatedAt }
            : prev,
        );
      } catch (err) {
        devError("Failed to assign table", err);
        setError(err instanceof Error ? err.message : m.admin_error_assign_table());
      }
    },
    [queryClient, registrationsQueryKey, tablesQueryKey, updateRegistrationMutation],
  );

  const handleAddTable = useCallback(
    async (name: string, capacity: number, layoutId: string, tableTypeId: string) => {
      const data = await createTableMutation.mutateAsync({ name, capacity, layoutId, tableTypeId });
      const table = (data.table ?? data) as Record<string, unknown>;
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? [...prev, apiTableToTable(table)] : [apiTableToTable(table)],
      );
    },
    [createTableMutation, queryClient, tablesQueryKey],
  );

  const handleMoveTable = useCallback(
    (tableId: string, x: number, y: number) => {
      moveTableMutation.mutate({ tableId, x, y });
    },
    [moveTableMutation],
  );

  const handleRotateTable = useCallback(
    (tableId: string, rotation: number) => {
      rotateTableMutation.mutate({ tableId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateTableMutation],
  );

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      await deleteTableMutation.mutateAsync(tableId);
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.id !== tableId) : prev,
      );
    },
    [deleteTableMutation, queryClient, tablesQueryKey],
  );

  const handleAddVenue = useCallback(
    async (name: string, address: string, city: string, postalCode: string, country: string) => {
      const d = await createVenueMutation.mutateAsync({ name, address, city, postalCode, country });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? [...prev, apiVenueToVenue(d)] : [apiVenueToVenue(d)],
      );
    },
    [createVenueMutation, queryClient, venuesQueryKey],
  );

  const handleArchiveVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: false });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleRestoreVenue = useCallback(
    async (venueId: string) => {
      const d = await updateVenueMutation.mutateAsync({ venueId, active: true });
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.map((v) => (v.id === venueId ? apiVenueToVenue(d) : v)) : prev,
      );
    },
    [queryClient, updateVenueMutation, venuesQueryKey],
  );

  const handleDeleteVenue = useCallback(
    async (venueId: string) => {
      await deleteVenueMutation.mutateAsync(venueId);
      queryClient.setQueryData<Venue[]>(venuesQueryKey, (prev) =>
        prev ? prev.filter((v) => v.id !== venueId) : prev,
      );
      // Cascade: remove rooms and their layouts/tables from local state
      const venueRoomIds = (roomsQuery.data ?? [])
        .filter((r) => r.venueId === venueId)
        .map((r) => r.id);
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.filter((r) => r.venueId !== venueId) : prev,
      );
      const venueLayoutIds = (layoutsQuery.data ?? [])
        .filter((l) => venueRoomIds.includes(l.roomId ?? ""))
        .map((l) => l.id);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => !venueRoomIds.includes(l.roomId ?? "")) : prev,
      );
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => !venueLayoutIds.includes(t.layoutId)) : prev,
      );
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => !venueLayoutIds.includes(a.layoutId)) : prev,
      );
    },
    [
      areasQueryKey,
      deleteVenueMutation,
      layoutsQuery.data,
      layoutsQueryKey,
      queryClient,
      roomsQuery.data,
      roomsQueryKey,
      tablesQueryKey,
      venuesQueryKey,
    ],
  );

  const handleAddRoom = useCallback(
    async (venueId: string, name: string, widthM: number, lengthM: number, color: string) => {
      const data = await createRoomMutation.mutateAsync({ venueId, name, widthM, lengthM, color });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? [...prev, apiRoomToRoom(data)] : [apiRoomToRoom(data)],
      );
    },
    [createRoomMutation, queryClient, roomsQueryKey],
  );

  const handleArchiveRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: false,
        fallbackMessage: m.admin_error_delete_room(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleRestoreRoom = useCallback(
    async (roomId: string) => {
      const data = await updateRoomMutation.mutateAsync({
        roomId,
        active: true,
        fallbackMessage: m.admin_content_error_save(),
      });
      queryClient.setQueryData<Room[]>(roomsQueryKey, (prev) =>
        prev ? prev.map((r) => (r.id === roomId ? apiRoomToRoom(data) : r)) : prev,
      );
    },
    [queryClient, roomsQueryKey, updateRoomMutation],
  );

  const handleAddLayout = useCallback(
    async (
      roomId: string,
      date: string,
      label?: string,
      copyFromLayoutId?: string | null,
      copyOptions?: { tables: boolean; areas: boolean },
    ) => {
      if (copyFromLayoutId) {
        const shouldCopyTables = copyOptions?.tables ?? true;
        const shouldCopyAreas = copyOptions?.areas ?? true;
        const copied = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
          `/api/layouts/${copyFromLayoutId}/copy`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              edition_id: activeEdition.id,
              room_id: roomId,
              date,
              ...(label?.trim() ? { label: label.trim() } : {}),
              copy_tables: shouldCopyTables,
              copy_areas: shouldCopyAreas,
            }),
          },
          m.admin_error_add_layout(),
        );
        const createdLayout = apiLayoutToLayout(copied);
        queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
          prev ? [...prev, createdLayout] : [createdLayout],
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: layoutsQueryKey }),
          queryClient.invalidateQueries({ queryKey: tablesQueryKey }),
          queryClient.invalidateQueries({ queryKey: areasQueryKey }),
        ]);
        return;
      }

      const d = await createLayoutMutation.mutateAsync({ roomId, date, label });
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? [...prev, apiLayoutToLayout(d)] : [apiLayoutToLayout(d)],
      );
    },
    [
      activeEdition.id,
      areasQueryKey,
      authHeaders,
      createLayoutMutation,
      layoutsQueryKey,
      queryClient,
      tablesQueryKey,
    ],
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      await deleteLayoutMutation.mutateAsync(layoutId);
      queryClient.setQueryData<Layout[]>(layoutsQueryKey, (prev) =>
        prev ? prev.filter((l) => l.id !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorTable[]>(tablesQueryKey, (prev) =>
        prev ? prev.filter((t) => t.layoutId !== layoutId) : prev,
      );
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.layoutId !== layoutId) : prev,
      );
    },
    [areasQueryKey, deleteLayoutMutation, layoutsQueryKey, queryClient, tablesQueryKey],
  );

  const handleAddArea = useCallback(
    async (
      label: string,
      icon: string,
      layoutId: string,
      widthM: number,
      lengthM: number,
      exhibitorId?: number,
    ) => {
      const data = await createAreaMutation.mutateAsync({
        label,
        icon,
        layoutId,
        widthM,
        lengthM,
        exhibitorId,
      });
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? [...prev, apiAreaToArea(data)] : [apiAreaToArea(data)],
      );
    },
    [areasQueryKey, createAreaMutation, queryClient],
  );

  const handleMoveArea = useCallback(
    (areaId: string, x: number, y: number) => {
      moveAreaMutation.mutate({ areaId, x, y });
    },
    [moveAreaMutation],
  );

  const handleRotateArea = useCallback(
    (areaId: string, rotation: number) => {
      rotateAreaMutation.mutate({ areaId, rotation: ((rotation % 360) + 360) % 360 });
    },
    [rotateAreaMutation],
  );

  const handleDeleteArea = useCallback(
    async (areaId: string) => {
      await deleteAreaMutation.mutateAsync(areaId);
      queryClient.setQueryData<FloorArea[]>(areasQueryKey, (prev) =>
        prev ? prev.filter((a) => a.id !== areaId) : prev,
      );
    },
    [areasQueryKey, deleteAreaMutation, queryClient],
  );

  const handleAssignAreaToItem = useCallback(
    async (areaId: string, exhibitorId: number | null, label?: string, icon?: string) => {
      const body: Record<string, unknown> = { exhibitor_id: exhibitorId };
      if (label !== undefined) body.label = label;
      if (icon !== undefined) body.icon = icon;
      await assignAreaMutation.mutateAsync({ areaId, body });
    },
    [assignAreaMutation],
  );

  const handleUpdateAreaLabel = useCallback(
    (areaId: string, label: string) => {
      updateAreaLabelMutation.mutate({ areaId, label });
    },
    [updateAreaLabelMutation],
  );

  const handleChangeTableType = useCallback(
    async (tableId: string, tableTypeId: string) => {
      await changeTableTypeMutation.mutateAsync({ tableId, tableTypeId });
    },
    [changeTableTypeMutation],
  );

  const handleUpdateTable = useCallback(
    async (tableId: string, name: string) => {
      await updateTableNameMutation.mutateAsync({ tableId, name });
    },
    [updateTableNameMutation],
  );

  const handleResizeArea = useCallback(
    async (areaId: string, widthM: number, lengthM: number) => {
      const area = (areasQuery.data ?? []).find((a) => a.id === areaId);
      const layout = (layoutsQuery.data ?? []).find((l) => l.id === area?.layoutId);
      const room = (roomsQuery.data ?? []).find((r) => r.id === layout?.roomId);

      // Clamp the area's position so it stays within the canvas after resize.
      let x = area?.x ?? 0;
      let y = area?.y ?? 0;
      if (area && room) {
        const { width: canvasW, height: canvasH } = getCanvasSizePx(room.widthM, room.lengthM);
        const { width: areaW, height: areaH } = getAreaSizePx(widthM, lengthM);
        x = (Math.max(0, Math.min((area.x / 100) * canvasW, canvasW - areaW)) / canvasW) * 100;
        y = (Math.max(0, Math.min((area.y / 100) * canvasH, canvasH - areaH)) / canvasH) * 100;
      }

      await resizeAreaMutation.mutateAsync({ areaId, widthM, lengthM, x, y });
    },
    [areasQuery.data, layoutsQuery.data, roomsQuery.data, resizeAreaMutation],
  );

  const handleAddRegistration = useCallback(
    (registration: Registration) => {
      queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
        prev ? [registration, ...prev] : [registration],
      );
    },
    [queryClient, registrationsQueryKey],
  );

  const handleAddTableType = useCallback(
    async (data: Omit<TableType, "id">) => {
      const d = await createTableTypeMutation.mutateAsync(data);
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? [...prev, apiTableTypeToTableType(d)] : [apiTableTypeToTableType(d)],
      );
    },
    [createTableTypeMutation, queryClient, tableTypesQueryKey],
  );

  const handleUpdateTableType = useCallback(
    async (id: string, data: Partial<Omit<TableType, "id">>) => {
      const d = await updateTableTypeMutation.mutateAsync({ id, data });
      queryClient.setQueryData<TableType[]>(tableTypesQueryKey, (prev) =>
        prev ? prev.map((tt) => (tt.id === id ? apiTableTypeToTableType(d) : tt)) : prev,
      );
    },
    [queryClient, tableTypesQueryKey, updateTableTypeMutation],
  );

  const handleArchiveTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: false }),
    [handleUpdateTableType],
  );

  const handleRestoreTableType = useCallback(
    (id: string) => handleUpdateTableType(id, { active: true }),
    [handleUpdateTableType],
  );

  /** Fetch the full registration (including checkInToken) and open detail modal */
  const handleViewDetail = useCallback(
    async (res: Registration) => {
      try {
        const data = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
          `/api/registrations/${res.id}`,
          { headers: authHeaders() },
          m.admin_error_load_data(),
        );
        setDetailRegistration(apiToRegistration(data));
      } catch (err) {
        devError("Failed to fetch registration detail, falling back to list data", err);
        setDetailRegistration(res);
      }
    },
    [authHeaders],
  );

  const handleToggleDelivered = useCallback(
    async (registrationId: string, updatedOrders: OrderItem[]) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: {
              pre_orders: updatedOrders.map((o) => ({
                product_id: o.productId,
                name: o.name,
                quantity: o.quantity,
                price: o.price,
                category: o.category,
                delivered: o.delivered,
              })),
            },
            fallbackMessage: m.admin_error_bottle_delivery(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to update bottle delivery status", err);
        setError(err instanceof Error ? err.message : m.admin_error_bottle_delivery());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleCheckIn = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { checked_in: true },
            fallbackMessage: m.admin_error_check_in(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to check in guest", err);
        setError(err instanceof Error ? err.message : m.admin_error_check_in());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  const handleIssueStrap = useCallback(
    async (registrationId: string) => {
      try {
        const updated = apiToRegistration(
          await updateRegistrationMutation.mutateAsync({
            id: registrationId,
            payload: { strap_issued: true },
            fallbackMessage: m.admin_error_issue_strap(),
          }),
        );
        queryClient.setQueryData<Registration[]>(registrationsQueryKey, (prev) =>
          prev ? prev.map((r) => (r.id === registrationId ? updated : r)) : prev,
        );
        setDetailRegistration((prev) => (prev?.id === registrationId ? updated : prev));
      } catch (err) {
        devError("Failed to issue strap", err);
        setError(err instanceof Error ? err.message : m.admin_error_issue_strap());
      }
    },
    [queryClient, registrationsQueryKey, updateRegistrationMutation],
  );

  // Computed maps derived from people/registrations state — must stay above any early return
  // to satisfy the Rules of Hooks (hooks must be called unconditionally).
  const registrationCountByPersonId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of registrationsQuery.data ?? []) {
      if (r.personId == null) continue;
      counts[r.personId] = (counts[r.personId] ?? 0) + 1;
    }
    return Object.fromEntries((peopleQuery.data ?? []).map((p) => [p.id, counts[p.id] ?? 0]));
  }, [peopleQuery.data, registrationsQuery.data]);

  const emailDuplicates = useMemo(() => {
    if (!detailRegistration) return [];
    const personEmail = detailRegistration.person.email.toLowerCase();
    return people
      .filter(
        (p) =>
          p.id !== detailRegistration.personId &&
          p.email &&
          p.email.toLowerCase() === personEmail,
      )
      .map((p) => ({ id: p.id, name: p.name }));
  }, [people, detailRegistration]);

  if (!visible) return null;

  if (sessionContext.loading) {
    return (
      <div className="py-5 text-center">
        <Spinner animation="border" variant="warning" role="status">
          <span className="visually-hidden">{m.admin_loading()}</span>
        </Spinner>
      </div>
    );
  }

  return (
    <section
      id="admin"
      aria-labelledby="admin-title"
      className={isAuthenticated ? "admin-authenticated" : "py-5"}
    >
      {isSessionLoading ? (
        /* ---- Session check in progress ---- */
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : !isAuthenticated ? (
        /* ---- Login (SuperTokens pre-built UI) ---- */
        <AdminLoginForm />
      ) : (
        /* ---- Authenticated: sidebar layout ---- */
        <div className="admin-layout">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="admin-sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          <AdminSidebar
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            navRef={navRef}
            handleNavKeyDown={handleNavKeyDown}
            registrationCount={registrations.length}
            peopleCount={people.length}
            isAnyFetching={isAnyFetching}
            onLoadData={loadData}
            onLogout={handleLogout}
          />

          {/* Main content */}
          <div className="admin-main" id="admin-content">
            {error && (
              <Alert variant="danger" className="mb-4" dismissible onClose={() => setError("")}>
                {error}
              </Alert>
            )}

            {isAnyPending ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" role="status">
                  <span className="visually-hidden">{m.admin_loading()}</span>
                </Spinner>
              </div>
            ) : (
              <div className="admin-content-pane" key={activeKey}>
                {activeKey === "registrations" && (
                  <RegistrationList
                    registrations={registrations}
                    tables={tables}
                    exhibitors={exhibitors}
                    filter={filter}
                    onFilterChange={setFilter}
                    onUpdateStatus={handleUpdateStatus}
                    onUpdatePayment={handleUpdatePayment}
                    onAssignTable={handleAssignTable}
                    onViewDetail={handleViewDetail}
                    onAddRegistration={handleAddRegistration}
                    authHeaders={authHeaders}
                  />
                )}
                {activeKey === "content" && (
                  <>
                    <nav aria-label="breadcrumb" className="admin-breadcrumb mb-2">
                      <span className="admin-breadcrumb-item">{m.admin_content_tab()}</span>
                      <i className="bi bi-chevron-right admin-breadcrumb-sep" aria-hidden="true" />
                      <span className="admin-breadcrumb-item is-active">
                        {contentTab === "exhibitors"
                          ? m.admin_content_exhibitors_section()
                          : m.admin_content_editions_section()}
                      </span>
                    </nav>
                    <div className="d-flex gap-2 mb-3">
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          contentTab === "exhibitors" && "is-active",
                        )}
                        onClick={() => setContentTab("exhibitors")}
                      >
                        <i className="bi bi-shop me-1" aria-hidden="true" />
                        {m.admin_content_exhibitors_section()}
                      </button>
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          contentTab === "editions" && "is-active",
                        )}
                        onClick={() => setContentTab("editions")}
                      >
                        <i className="bi bi-calendar3 me-1" aria-hidden="true" />
                        {m.admin_content_editions_section()}
                      </button>
                    </div>
                    {contentTab === "exhibitors" && (
                      <Card bg="dark" text="white" border="secondary" className="mb-3">
                        <Card.Body>
                          <ContentSection
                            sectionKey="exhibitors"
                            title={m.admin_content_exhibitors_section()}
                            authHeaders={authHeaders}
                            onItemSaved={handleExhibitorSaved}
                            onItemDeleted={handleExhibitorDeleted}
                          />
                        </Card.Body>
                      </Card>
                    )}
                    {contentTab === "editions" && (
                      <Card bg="dark" text="white" border="secondary" className="mb-3">
                        <Card.Body>
                          <EditionsSection
                            authHeaders={authHeaders}
                            venues={venues}
                            onEditionMutated={() => {
                              void loadData();
                              void queryClient.invalidateQueries({
                                queryKey: activeEditionQueryKey,
                              });
                              void queryClient.invalidateQueries({
                                queryKey: queryKeys.admin.activeEditionEvents,
                              });
                            }}
                          />
                        </Card.Body>
                      </Card>
                    )}
                  </>
                )}
                {activeKey === "floor-plans" && (
                  <LayoutEditor
                    dayOptions={layoutDayOptions}
                    tables={tables}
                    tableTypes={tableTypes}
                    layouts={layouts}
                    registrations={registrations}
                    rooms={rooms}
                    exhibitors={exhibitors}
                    areas={areas}
                    onAddTable={handleAddTable}
                    onMoveTable={handleMoveTable}
                    onDeleteTable={handleDeleteTable}
                    onRotateTable={handleRotateTable}
                    onAddLayout={handleAddLayout}
                    onDeleteLayout={handleDeleteLayout}
                    onAddArea={handleAddArea}
                    onMoveArea={handleMoveArea}
                    onDeleteArea={handleDeleteArea}
                    onRotateArea={handleRotateArea}
                    onAssignAreaToItem={handleAssignAreaToItem}
                    onUpdateAreaLabel={handleUpdateAreaLabel}
                    onChangeTableType={handleChangeTableType}
                    onUpdateTable={handleUpdateTable}
                    onResizeArea={handleResizeArea}
                  />
                )}
                {activeKey === "venue" && (
                  <>
                    <nav aria-label="breadcrumb" className="admin-breadcrumb mb-2">
                      <span className="admin-breadcrumb-item">{m.admin_venues_tab()}</span>
                      <i className="bi bi-chevron-right admin-breadcrumb-sep" aria-hidden="true" />
                      <span className="admin-breadcrumb-item is-active">
                        {venueTab === "venues" ? m.admin_venues_rooms_tab() : m.admin_table_types_tab()}
                      </span>
                    </nav>
                    <div className="d-flex gap-2 mb-3">
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          venueTab === "venues" && "is-active",
                        )}
                        onClick={() => setVenueTab("venues")}
                      >
                        <i className="bi bi-building me-1" aria-hidden="true" />
                        {m.admin_venues_rooms_tab()}
                      </button>
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          venueTab === "table-types" && "is-active",
                        )}
                        onClick={() => setVenueTab("table-types")}
                      >
                        <i className="bi bi-grid me-1" aria-hidden="true" />
                        {m.admin_table_types_tab()}
                      </button>
                    </div>
                    {venueTab === "venues" && (
                      <VenueManagement
                        key="venues"
                        venues={venues}
                        rooms={rooms}
                        onAdd={handleAddVenue}
                        onArchive={handleArchiveVenue}
                        onRestore={handleRestoreVenue}
                        onDelete={handleDeleteVenue}
                        onAddRoom={handleAddRoom}
                        onArchiveRoom={handleArchiveRoom}
                        onRestoreRoom={handleRestoreRoom}
                      />
                    )}
                    {venueTab === "table-types" && (
                      <TableTypeManagement
                        key="table-types"
                        tableTypes={tableTypes}
                        onAdd={handleAddTableType}
                        onUpdate={handleUpdateTableType}
                        onArchive={handleArchiveTableType}
                        onRestore={handleRestoreTableType}
                      />
                    )}
                  </>
                )}
                {activeKey === "people" && (
                  <>
                    {/* Breadcrumb trail */}
                    <nav aria-label="breadcrumb" className="admin-breadcrumb mb-2">
                      <span className="admin-breadcrumb-item">{m.admin_people_tab()}</span>
                      <i className="bi bi-chevron-right admin-breadcrumb-sep" aria-hidden="true" />
                      <span className="admin-breadcrumb-item is-active">
                        {peopleTab === "directory"
                          ? m.admin_directory_tab()
                          : peopleTab === "members"
                            ? m.admin_members_tab()
                            : m.admin_volunteers_tab()}
                      </span>
                    </nav>
                    {/* People sub-tab bar */}
                    <div className="d-flex gap-2 mb-3">
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          peopleTab === "directory" && "is-active",
                        )}
                        onClick={() => setPeopleTab("directory")}
                      >
                        <i className="bi bi-person me-1" aria-hidden="true" />
                        {m.admin_directory_tab()}
                        {people.length > 0 && (
                          <span className="admin-nav-count ms-1">{people.length}</span>
                        )}
                      </button>
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          peopleTab === "members" && "is-active",
                        )}
                        onClick={() => setPeopleTab("members")}
                      >
                        <i className="bi bi-person-badge me-1" aria-hidden="true" />
                        {m.admin_members_tab()}
                        {members.length > 0 && (
                          <span className="admin-nav-count ms-1">{members.length}</span>
                        )}
                      </button>
                      <button
                        className={clsx(
                          "admin-nav-item",
                          "admin-sub-tab",
                          peopleTab === "volunteers" && "is-active",
                        )}
                        onClick={() => setPeopleTab("volunteers")}
                      >
                        <i className="bi bi-hand-thumbs-up me-1" aria-hidden="true" />
                        {m.admin_volunteers_tab()}
                        {volunteers.length > 0 && (
                          <span className="admin-nav-count ms-1">{volunteers.length}</span>
                        )}
                      </button>
                    </div>
                    {peopleTab === "directory" && (
                      <PeopleManagement
                        key="directory"
                        people={people}
                        registrationCountByPersonId={registrationCountByPersonId}
                        isLoading={isAnyFetching}
                        authHeaders={authHeaders}
                        onMerge={handleMergePeople}
                        onCreate={handleCreatePerson}
                        onUpdate={handleUpdatePerson}
                        onDelete={handleDeletePerson}
                      />
                    )}
                    {peopleTab === "members" && (
                      <MembersManagement
                        key="members"
                        members={members}
                        registrationCountByPersonId={registrationCountByPersonId}
                        isLoading={isAnyFetching}
                        onCreate={handleCreateMember}
                        onUpdate={handleUpdateMember}
                        onDelete={handleDeleteMember}
                      />
                    )}
                    {peopleTab === "volunteers" && (
                      <VolunteersManagement
                        key="volunteers"
                        volunteers={volunteers}
                        isLoading={isAnyFetching}
                        onCreate={handleCreateVolunteer}
                        onUpdate={handleUpdateVolunteer}
                        onDelete={handleDeleteVolunteer}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration detail modal */}
      {detailRegistration && (
        <RegistrationDetail
          registration={detailRegistration}
          baseUrl={window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "")}
          emailDuplicates={emailDuplicates}
          onClose={() => setDetailRegistration(null)}
          onToggleDelivered={handleToggleDelivered}
          onCheckIn={handleCheckIn}
          onIssueStrap={handleIssueStrap}
          onMergeDuplicate={async (canonicalId, duplicateId) => {
            try {
              await handleMergePeople(canonicalId, duplicateId);
              setDetailRegistration(null);
            } catch (err) {
              devError("Failed to merge people", err);
              setError(err instanceof Error ? err.message : m.admin_people_merge_error());
            }
          }}
        />
      )}
    </section>
  );
}
