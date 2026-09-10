"""Persist Phase 1 operations, remove stale table reservation data, add versioned policy publishing, marketing opt-in consent fields, cross-worker rate-limit buckets, visitor passwordless sessions, Web Push subscriptions, the central composer for announcements/push, booking product inventory/packages with consolidated notes, a short product description, and the append-only payment transaction ledger.

Revision ID: 001
Revises: 000
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "001"
down_revision: str | None = "000"
branch_labels = None
depends_on = None

_PRIVACY_TITLES = {
    "nl": "Privacybeleid",
    "en": "Privacy Policy",
    "fr": "Politique de Confidentialité",
}

_PRIVACY_CONTENT = {
    "nl": "Dit Privacybeleid legt uit hoe het Champagnefestival uw persoonlijke gegevens verzamelt, gebruikt en beschermt wanneer u onze website (champagnefestival.tjor.im) of onze Android-app gebruikt.\n\n## Informatie die wij verzamelen\n\nAfhankelijk van hoe u met ons omgaat, kunnen wij het volgende verzamelen: uw naam, e-mailadres en bericht wanneer u het contactformulier gebruikt; uw naam, e-mailadres, telefoonnummer, aantal gasten, bestellingen en eventuele opmerkingen over toegankelijkheid of dieetwensen wanneer u zich inschrijft voor een evenement; en uw aanmeldgegevens (via onze identiteitsprovider) als u vrijwilliger of beheerder bent.\n\n## Account en aanmelden\n\nBezoekers kunnen een portaalaccount gebruiken om gekoppelde inschrijvingen te bekijken, terwijl vrijwilligers en beheerders zich aanmelden via onze identiteitsprovider met een standaard beveiligde aanmelding (OpenID Connect). Wij ontvangen of bewaren uw wachtwoord niet: authenticatie wordt volledig afgehandeld door de identiteitsprovider, die alleen de minimale identiteitsgegevens deelt die wij nodig hebben om u toegang te geven die past bij uw rol.\n\n## Evenementregistratie en check-in\n\nWanneer u zich inschrijft voor een evenement, bewaren wij uw inschrijvingsgegevens (aantal gasten, bestellingen, opmerkingen en toegankelijkheidsbehoeften) samen met een unieke check-intoken. Aan de deur scant of voert het festivalpersoneel dit token in om uw aanwezigheid te bevestigen; wij registreren alleen de check-instatus en het tijdstip voor de organisatie van het evenement.\n\n## Cameratoegang voor het scannen van QR-codes\n\nOnze Android-app vraagt alleen cameratoegang om QR-codes te scannen op de dag van het evenement, bijvoorbeeld om gasten in te checken. De camerabeelden worden op uw toestel verwerkt om de code te lezen; wij maken, bewaren of versturen geen foto's of video's, en de camera wordt nooit op de achtergrond gebruikt.\n\n## Hoe wij uw informatie gebruiken\n\nWij gebruiken de informatie die u ons verstrekt om te reageren op vragen, evenementinschrijvingen te verwerken en te beheren, check-ins te verifiëren en passende toegang te verlenen aan vrijwilligers en beheerders. Wij verkopen uw persoonlijke gegevens niet en gebruiken ze niet voor reclamedoeleinden.\n\n## Hoe gegevens worden verzonden\n\nDe website en de Android-app communiceren met onze servers via versleutelde HTTPS-verbindingen om evenementinformatie te laden en formulieren zoals inschrijvingen en check-ins te versturen. Er worden geen gegevens gedeeld met derden voor marketingdoeleinden.\n\n## Diagnostiek en operationele logboeken\n\nOnze servers houden operationele logboeken en een auditspoor van beheerdersacties bij (bijvoorbeeld wie een gast heeft ingecheckt) om het festival soepel en veilig te laten verlopen. Wij kunnen ook tools voor foutmonitoring gebruiken om technische problemen te diagnosticeren; deze tools worden uitsluitend gebruikt om bugs op te lossen en nooit voor reclame of tracking.\n\n## Bewaartermijn van gegevens\n\nWij bewaren inschrijvings-, bestel-, betalings-, check-in- en auditgegevens zolang als nodig is om de huidige en toekomstige editie van het festival te organiseren en om aan onze wettelijke, boekhoudkundige, geschilafhandelings- en fraudepreventieverplichtingen te voldoen. Accountkoppelingen kunnen op verzoek worden verwijderd. Wij werken nog aan een geautomatiseerd proces om operationele records te verwijderen of te anonimiseren zodra ze niet langer nodig zijn; tot dat proces er is, behandelen wij verzoeken tot bewaring of verwijdering van specifieke gegevens handmatig — zie \"Uw rechten en het verwijderen van gegevens\" hieronder.\n\n## Hoe wij uw informatie beschermen\n\nWij nemen passende technische en organisatorische beveiligingsmaatregelen, waaronder versleutelde verzending en beperkte toegang tot inschrijvings- en accountgegevens, om uw persoonlijke gegevens te beschermen tegen ongeoorloofde toegang, wijziging of openbaarmaking.\n\n## Cookies en lokale opslag\n\nOnze website en app gebruiken cookies en lokale opslag om uw taalvoorkeur te onthouden en u aangemeld te houden. Wij gebruiken geen advertentie- of trackingcookies van derden.\n\n## Uw rechten en het verwijderen van gegevens\n\nU kunt op elk moment contact met ons opnemen via onderstaande gegevens om vragen te stellen over, correcties aan te brengen in, of de verwijdering te vragen van de persoonlijke gegevens die wij over u bewaren. Als u accountverwijdering vraagt, verwijderen of ontkoppelen wij uw portaalaccount. Inschrijvings-, ticket-, bestel-, betalings-, check-in- en auditgegevens kunnen worden bewaard wanneer dat nodig is voor evenementorganisatie, boekhouding, wettelijke verplichtingen, geschillen of fraudepreventie; wij hebben nog geen geautomatiseerd proces voor het verwijderen of anonimiseren van deze gegevens, dus een verzoek om specifieke persoonsgegevens te wissen of te anonimiseren wordt handmatig en per geval beoordeeld en uitgevoerd.\n\n## Privacy van kinderen\n\nDe website en app van het Champagnefestival richten zich op een algemeen volwassen publiek en zijn niet bedoeld voor kinderen. Wij verzamelen niet bewust persoonlijke informatie van kinderen.\n\n## Wijzigingen in dit beleid\n\nWij kunnen dit beleid van tijd tot tijd bijwerken naarmate het festival en de app zich ontwikkelen. Belangrijke wijzigingen worden weergegeven door de datum van laatste update hierboven bij te werken.\n\n## Contact met ons opnemen\n\nAls u vragen heeft over dit privacybeleid of uw rechten met betrekking tot uw gegevens wilt uitoefenen, neem dan contact met ons op:",
    "en": 'This Privacy Policy explains how the Champagnefestival collects, uses, and protects your personal information when you use our website (champagnefestival.tjor.im) or our Android app.\n\n## Information We Collect\n\nDepending on how you interact with us, we may collect: your name, email address, and message when you use the contact form; your name, email, phone number, guest count, order items, and any accessibility or dietary notes when you register for an event; and your sign-in details (via our identity provider) if you are a volunteer or administrator.\n\n## Account and Sign-In\n\nVisitors may use a portal account to view claimed registrations, while volunteers and administrators sign in through our identity provider using a standard secure login (OpenID Connect). We do not receive or store your password — authentication is handled entirely by the identity provider, which shares only the minimum identity details we need to grant access matching your role.\n\n## Event Registration and Check-In\n\nWhen you register for an event we store your registration details (guest count, order items, notes, and accessibility needs) together with a unique check-in token. At the door, festival staff scan or enter this token to confirm your attendance; we record only the check-in status and time for event management purposes.\n\n## Camera Access for QR Code Scanning\n\nOur Android app requests camera access only to scan QR codes on the day of the event, for example to check guests in. The camera feed is processed on your device to read the code; we do not capture, store, or transmit photos or video, and the camera is never accessed in the background.\n\n## How We Use Your Information\n\nWe use the information you provide to respond to enquiries, process and manage event registrations, verify check-ins, and grant appropriate access to volunteers and administrators. We do not sell your personal information or use it for advertising.\n\n## How Data Is Transmitted\n\nThe website and Android app communicate with our backend servers over encrypted HTTPS connections to load event information and submit forms such as registrations and check-ins. No data is shared with third parties for marketing purposes.\n\n## Diagnostics and Operational Logs\n\nOur servers keep operational logs and an audit trail of administrative actions (such as who checked a guest in) to keep the festival running smoothly and securely. We may also use error-monitoring tooling to diagnose technical problems; these tools are used solely to fix bugs and are never used for advertising or tracking.\n\n## Data Retention\n\nWe keep registration, order, payment, check-in, and audit records for as long as needed to organise the current and upcoming edition of the festival and to meet our legal, accounting, dispute-resolution, and fraud-prevention obligations. Account links can be removed on request. We are still building an automated process to delete or anonymise operational records once they are no longer needed; until it is in place, retention and deletion requests for specific records are reviewed and handled manually — see "Your Rights and Data Deletion" below.\n\n## How We Protect Your Information\n\nWe implement appropriate technical and organisational security measures, including encrypted transmission and restricted access to registration and account data, to protect your personal information from unauthorised access, alteration, or disclosure.\n\n## Cookies and Local Storage\n\nOur website and app use cookies and local storage to remember your language preference and to keep you signed in. We do not use third-party advertising or tracking cookies.\n\n## Your Rights and Data Deletion\n\nYou may contact us at any time, using the details below, to ask about, correct, or request the removal of the personal information we hold about you. If you request account deletion, we remove or unlink your portal account. Reservation, ticket, order, payment, check-in, and audit records may be retained where needed for event operations, accounting, legal obligations, disputes, or fraud prevention; we do not yet operate an automated deletion or anonymisation pipeline for these records, so a request to erase or anonymise specific personal data is reviewed and actioned manually on a case-by-case basis.\n\n## Children\'s Privacy\n\nThe Champagnefestival website and app are intended for a general adult audience and are not directed at children. We do not knowingly collect personal information from children.\n\n## Changes to This Policy\n\nWe may update this policy from time to time as the festival and its app evolve. Material changes will be reflected by updating the last updated date above.\n\n## Contact Us\n\nIf you have any questions about this privacy policy or wish to exercise your data rights, please contact us:',
    "fr": "Cette Politique de Confidentialité explique comment le Champagnefestival collecte, utilise et protège vos informations personnelles lorsque vous utilisez notre site web (champagnefestival.tjor.im) ou notre application Android.\n\n## Informations que nous collectons\n\nSelon la façon dont vous interagissez avec nous, nous pouvons collecter : votre nom, votre adresse e-mail et votre message lorsque vous utilisez le formulaire de contact ; votre nom, e-mail, numéro de téléphone, nombre d'invités, commandes et toute remarque relative à l'accessibilité ou aux régimes alimentaires lorsque vous vous inscrivez à un événement ; ainsi que vos informations de connexion (via notre fournisseur d'identité) si vous êtes bénévole ou administrateur.\n\n## Compte et connexion\n\nLes visiteurs peuvent utiliser un compte portail pour consulter les inscriptions qui leur sont liées, tandis que les bénévoles et les administrateurs se connectent via notre fournisseur d'identité à l'aide d'une connexion sécurisée standard (OpenID Connect). Nous ne recevons ni ne stockons votre mot de passe : l'authentification est entièrement gérée par le fournisseur d'identité, qui ne partage que les informations d'identité minimales nécessaires pour vous accorder l'accès correspondant à votre rôle.\n\n## Inscription à l'événement et enregistrement sur place\n\nLorsque vous vous inscrivez à un événement, nous conservons les détails de votre inscription (nombre d'invités, commandes, remarques et besoins d'accessibilité) ainsi qu'un jeton d'enregistrement unique. À l'entrée, le personnel du festival scanne ou saisit ce jeton pour confirmer votre présence ; nous n'enregistrons que le statut et l'heure de l'enregistrement à des fins de gestion de l'événement.\n\n## Accès à la caméra pour la lecture des codes QR\n\nNotre application Android demande l'accès à la caméra uniquement pour scanner les codes QR le jour de l'événement, par exemple pour enregistrer l'arrivée des invités. Le flux de la caméra est traité sur votre appareil pour lire le code ; nous ne capturons, ne stockons ni ne transmettons aucune photo ou vidéo, et la caméra n'est jamais utilisée en arrière-plan.\n\n## Comment nous utilisons vos informations\n\nNous utilisons les informations que vous nous fournissez pour répondre à vos demandes, traiter et gérer les inscriptions aux événements, vérifier les enregistrements sur place et accorder les accès appropriés aux bénévoles et administrateurs. Nous ne vendons pas vos informations personnelles et ne les utilisons pas à des fins publicitaires.\n\n## Comment les données sont transmises\n\nLe site web et l'application Android communiquent avec nos serveurs via des connexions HTTPS chiffrées afin de charger les informations sur les événements et d'envoyer des formulaires tels que les inscriptions et les enregistrements. Aucune donnée n'est partagée avec des tiers à des fins marketing.\n\n## Diagnostics et journaux opérationnels\n\nNos serveurs conservent des journaux opérationnels et un historique des actions administratives (par exemple qui a enregistré l'arrivée d'un invité) afin d'assurer le bon déroulement et la sécurité du festival. Nous pouvons également utiliser des outils de surveillance des erreurs pour diagnostiquer des problèmes techniques ; ces outils servent uniquement à corriger des bugs et ne sont jamais utilisés à des fins publicitaires ou de suivi.\n\n## Conservation des données\n\nNous conservons les données d'inscription, de commande, de paiement, d'enregistrement sur place et d'audit aussi longtemps que nécessaire pour organiser l'édition actuelle et les éditions à venir du festival et pour respecter nos obligations légales, comptables, de gestion des litiges et de prévention de la fraude. Les liens de compte peuvent être supprimés sur demande. Nous développons encore un processus automatisé permettant de supprimer ou d'anonymiser les dossiers opérationnels lorsqu'ils ne sont plus nécessaires ; en attendant, les demandes de conservation ou de suppression de données spécifiques sont traitées manuellement — voir « Vos droits et la suppression de vos données » ci-dessous.\n\n## Comment nous protégeons vos informations\n\nNous mettons en œuvre des mesures de sécurité techniques et organisationnelles appropriées, y compris une transmission chiffrée et un accès restreint aux données d'inscription et de compte, afin de protéger vos informations personnelles contre tout accès, modification ou divulgation non autorisés.\n\n## Cookies et stockage local\n\nNotre site web et notre application utilisent des cookies et le stockage local pour mémoriser votre préférence linguistique et vous garder connecté. Nous n'utilisons pas de cookies publicitaires ou de suivi tiers.\n\n## Vos droits et la suppression de vos données\n\nVous pouvez à tout moment nous contacter aux coordonnées ci-dessous pour vous renseigner sur les informations personnelles que nous détenons à votre sujet, les corriger ou en demander la suppression. Si vous demandez la suppression de votre compte, nous supprimons ou dissocions votre compte portail. Les inscriptions, billets, commandes, paiements, enregistrements sur place et journaux d'audit peuvent être conservés lorsque cela est nécessaire pour l'organisation de l'événement, la comptabilité, les obligations légales, les litiges ou la prévention de la fraude ; nous ne disposons pas encore d'un processus automatisé de suppression ou d'anonymisation de ces données, une demande d'effacement ou d'anonymisation de données personnelles spécifiques est donc examinée et traitée manuellement, au cas par cas.\n\n## Confidentialité des enfants\n\nLe site web et l'application du Champagnefestival s'adressent à un public adulte général et ne sont pas destinés aux enfants. Nous ne collectons pas sciemment d'informations personnelles auprès d'enfants.\n\n## Modifications de cette politique\n\nNous pouvons mettre à jour cette politique de temps à autre à mesure que le festival et son application évoluent. Les modifications importantes seront reflétées par la mise à jour de la date de dernière mise à jour ci-dessus.\n\n## Contactez-nous\n\nSi vous avez des questions concernant cette politique de confidentialité ou souhaitez exercer vos droits sur vos données, veuillez nous contacter :",
}


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("client_ip", sa.String(45), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contact_messages_created_at", "contact_messages", ["created_at"])
    op.add_column(
        "app_settings",
        sa.Column(
            "public_email",
            sa.String(320),
            nullable=False,
            server_default="nancy.cattrysse@telenet.be",
        ),
    )
    op.add_column("people", sa.Column("preferred_language", sa.String(length=2), nullable=True))
    op.create_check_constraint(
        "ck_people_preferred_language",
        "people",
        "preferred_language IS NULL OR preferred_language IN ('nl', 'fr', 'en')",
    )
    op.alter_column("table_types", "max_capacity", new_column_name="capacity")
    op.add_column(
        "events",
        sa.Column("registrations_close_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_column("tables", "reservation_ids")
    op.drop_column("tables", "capacity")
    op.create_table(
        "outbox_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("job_type", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("deduplication_key", sa.String(200), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_token", sa.String(64), nullable=True),
        sa.Column("last_error_code", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("deduplication_key", name="uq_outbox_jobs_deduplication_key"),
    )
    op.create_index("ix_outbox_jobs_job_type", "outbox_jobs", ["job_type"])
    op.create_index("ix_outbox_jobs_resource_id", "outbox_jobs", ["resource_id"])
    op.create_index("ix_outbox_jobs_state", "outbox_jobs", ["state"])
    op.create_index("ix_outbox_jobs_scheduled_at", "outbox_jobs", ["scheduled_at"])
    op.create_table(
        "delivery_attempts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("job_id", sa.String(64), sa.ForeignKey("outbox_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_delivery_attempts_job_id", "delivery_attempts", ["job_id"])
    op.add_column(
        "app_settings",
        sa.Column("public_phone", sa.String(30), nullable=False, server_default="+32 478 48 01 77"),
    )
    op.add_column(
        "app_settings",
        sa.Column(
            "facebook_url",
            sa.String(500),
            nullable=False,
            server_default="https://www.facebook.com/champagnefestival.kust",
        ),
    )
    op.create_table(
        "announcements",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("text_nl", sa.String(500), nullable=True),
        sa.Column("text_en", sa.String(500), nullable=True),
        sa.Column("text_fr", sa.String(500), nullable=True),
        sa.Column("level", sa.String(10), nullable=False, server_default="info"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("link_url", sa.String(1000), nullable=True),
        sa.Column("link_label_nl", sa.String(120), nullable=True),
        sa.Column("link_label_en", sa.String(120), nullable=True),
        sa.Column("link_label_fr", sa.String(120), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_announcements_level"),
        sa.CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
            name="ck_announcements_window",
        ),
        sa.UniqueConstraint("sort_order", name="uq_announcements_sort_order", deferrable=True, initially="DEFERRED"),
    )

    op.create_table(
        "policies",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("title_nl", sa.String(200), nullable=False),
        sa.Column("title_en", sa.String(200), nullable=True),
        sa.Column("title_fr", sa.String(200), nullable=True),
        sa.Column("required_locales", sa.String(20), nullable=False, server_default="nl,en,fr"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "policy_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("policy_key", sa.String(64), sa.ForeignKey("policies.key"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("content_nl", sa.Text(), nullable=True),
        sa.Column("content_en", sa.Text(), nullable=True),
        sa.Column("content_fr", sa.Text(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.String(255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", sa.String(255), nullable=True),
    )
    op.create_unique_constraint("uq_policy_versions_number", "policy_versions", ["policy_key", "version_number"])
    op.create_check_constraint(
        "ck_policy_versions_status",
        "policy_versions",
        "status IN ('draft', 'published', 'superseded')",
    )
    # Partial unique indexes are the DB-level enforcement of the publication
    # rules: at most one open draft and at most one current published version
    # per policy, at any time — including under concurrent writers.
    op.create_index(
        "uq_policy_versions_one_draft",
        "policy_versions",
        ["policy_key"],
        unique=True,
        postgresql_where=sa.text("status = 'draft'"),
    )
    op.create_index(
        "uq_policy_versions_one_published",
        "policy_versions",
        ["policy_key"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )

    # Seed the `privacy` policy and migrate the currently-compiled policy text
    # (frontend/messages/{nl,en,fr}.json `privacy_*` keys, as displayed by the
    # static `PrivacyPolicyPage` prior to this migration) into an initial
    # published version, per #944's acceptance criteria. The content is
    # carried over unchanged — this asserts no new promise the app doesn't
    # already make publicly. `published_at` is backdated to the site's own
    # "Last Updated: July 2026" rather than this migration's run date, since
    # the text itself hasn't changed and #944 derives "last updated" from
    # `published_at`. #934 (the retention/erasure mechanism this policy
    # describes) remains open and should land before this text is next
    # revised through the admin editor.
    policies = sa.table(
        "policies",
        sa.column("key", sa.String),
        sa.column("title_nl", sa.String),
        sa.column("title_en", sa.String),
        sa.column("title_fr", sa.String),
        sa.column("required_locales", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    policy_versions = sa.table(
        "policy_versions",
        sa.column("id", sa.String),
        sa.column("policy_key", sa.String),
        sa.column("version_number", sa.Integer),
        sa.column("status", sa.String),
        sa.column("content_nl", sa.Text),
        sa.column("content_en", sa.Text),
        sa.column("content_fr", sa.Text),
        sa.column("change_summary", sa.Text),
        sa.column("created_at", sa.DateTime),
        sa.column("created_by", sa.String),
        sa.column("updated_at", sa.DateTime),
        sa.column("published_at", sa.DateTime),
        sa.column("published_by", sa.String),
    )

    now = datetime.now(UTC)
    published_at = datetime(2026, 7, 1, tzinfo=UTC)
    migration_actor = "migration:001_contact_messages"

    op.bulk_insert(
        policies,
        [
            {
                "key": "privacy",
                "title_nl": _PRIVACY_TITLES["nl"],
                "title_en": _PRIVACY_TITLES["en"],
                "title_fr": _PRIVACY_TITLES["fr"],
                "required_locales": "nl,en,fr",
                "created_at": now,
            }
        ],
    )
    op.bulk_insert(
        policy_versions,
        [
            {
                "id": "polv_seed_privacy_1",
                "policy_key": "privacy",
                "version_number": 1,
                "status": "published",
                "content_nl": _PRIVACY_CONTENT["nl"],
                "content_en": _PRIVACY_CONTENT["en"],
                "content_fr": _PRIVACY_CONTENT["fr"],
                "change_summary": "Initial migration of the compiled privacy policy text (#944).",
                "created_at": now,
                "created_by": migration_actor,
                "updated_at": now,
                "published_at": published_at,
                "published_by": migration_actor,
            }
        ],
    )
    op.add_column(
        "people",
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "people",
        sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True), nullable=True),
    )
    # #932 decision 1: cross-worker rate-limit counter for check-in's
    # per-registration limit and shared-IP backstop (app.ratelimit.check_rate_limit_pg).
    op.create_table(
        "rate_limit_buckets",
        sa.Column("key", sa.String(300), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
    )

    # #953 decision 1: visitor accounts extend User rather than a parallel
    # identity model — oidc_subject becomes nullable, verified_email is its
    # visitor-account counterpart, exactly one of the two is ever set.
    op.alter_column("users", "oidc_subject", nullable=True)
    op.add_column("users", sa.Column("verified_email", sa.String(320), nullable=True))
    op.create_index("ix_users_verified_email", "users", ["verified_email"], unique=True)
    op.create_check_constraint(
        "ck_users_exactly_one_identity",
        "users",
        "(oidc_subject IS NOT NULL) != (verified_email IS NOT NULL)",
    )
    # #953 decision 2: passwordless sign-in link, structurally identical to
    # reservation_access_tokens but kept separate — redeeming this one
    # establishes a persistent VisitorSession, not a one-shot read.
    op.create_table(
        "visitor_magic_links",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # #953 decision 3: database-backed visitor session (7-day idle / 30-day
    # hard cap), not a stateless JWT — see app.visitor_session.
    op.create_table(
        "visitor_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_hash", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hard_expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Matches models.py's session_hash = mapped_column(unique=True, index=True):
    # a unique *index*, not a unique table constraint (op.create_table's
    # column-level unique=True would add a constraint instead, drifting from
    # what SQLAlchemy would autogenerate — caught by `alembic check` in CI).
    op.create_index("ix_visitor_sessions_session_hash", "visitor_sessions", ["session_hash"], unique=True)
    op.create_index("ix_visitor_sessions_user_id", "visitor_sessions", ["user_id"])
    op.create_index("ix_visitor_sessions_expires_at", "visitor_sessions", ["expires_at"])
    op.create_index("ix_visitor_sessions_hard_expires_at", "visitor_sessions", ["hard_expires_at"])

    # #941: anonymous, device-scoped Web Push subscriptions — see
    # app.models.PushSubscription.
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("endpoint", sa.String(600), nullable=False),
        sa.Column("p256dh_key", sa.String(200), nullable=False),
        sa.Column("auth_key", sa.String(50), nullable=False),
        sa.Column("locale", sa.String(2), nullable=False),
        sa.Column("categories", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("event_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_push_subscriptions_endpoint", "push_subscriptions", ["endpoint"], unique=True)
    op.create_index("ix_push_subscriptions_last_seen_at", "push_subscriptions", ["last_seen_at"])

    # #942: central composer for in-app announcements and Web Push — see
    # app.models.ComposedMessage.
    op.create_table(
        "composed_messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("title_nl", sa.String(500), nullable=True),
        sa.Column("title_en", sa.String(500), nullable=True),
        sa.Column("title_fr", sa.String(500), nullable=True),
        sa.Column("body_nl", sa.String(500), nullable=True),
        sa.Column("body_en", sa.String(500), nullable=True),
        sa.Column("body_fr", sa.String(500), nullable=True),
        sa.Column("level", sa.String(10), nullable=False, server_default="info"),
        sa.Column("channels", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("link_url", sa.String(1000), nullable=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "announcement_id",
            sa.String(64),
            sa.ForeignKey("announcements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("push_audience_snapshot", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("level IN ('info', 'warning', 'urgent')", name="ck_composed_messages_level"),
        sa.CheckConstraint("state IN ('draft', 'scheduled', 'sent')", name="ck_composed_messages_state"),
    )
    op.create_index("ix_composed_messages_state", "composed_messages", ["state"])

    op.execute("""
        UPDATE registrations SET notes = CASE
            WHEN coalesce(accessibility_note, '') = '' OR accessibility_note = notes THEN notes
            WHEN coalesce(notes, '') = '' THEN accessibility_note
            ELSE notes || E'\\n\\n' || accessibility_note END
    """)
    op.drop_column("registrations", "accessibility_note")
    op.add_column("registrations", sa.Column("product_snapshot", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("registrations", sa.Column("amount_paid", sa.Numeric(10, 2), nullable=False, server_default="0"))
    op.execute(
        "UPDATE registrations SET amount_paid = amount_due WHERE payment_status = 'paid' AND amount_due IS NOT NULL AND amount_due > 0"
    )
    op.add_column("products", sa.Column("unit", sa.String(10), nullable=False, server_default="item"))
    op.add_column("products", sa.Column("stock", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("inclusions", sa.JSON(), nullable=True))
    op.create_check_constraint("ck_product_stock", "products", "stock IS NULL OR stock >= 0")
    op.create_check_constraint("ck_product_unit", "products", "unit IN ('item', 'table', 'person')")

    bind = op.get_bind()
    # A layout's day_id only ever meant "the Nth distinct event date within
    # this edition" (see the removed resolve_layout_day()); reconstruct that
    # mapping to backfill event_id instead of requiring existing floor plans
    # to be deleted.
    bind.execute(
        sa.text("""
            CREATE TEMP TABLE _layout_event_map AS
            WITH edition_dates AS (
                SELECT edition_id, date, row_number() OVER (PARTITION BY edition_id ORDER BY date) AS day_id
                FROM (SELECT DISTINCT edition_id, date FROM events) AS d
            ),
            matches AS (
                SELECT l.id AS layout_id, e.id AS event_id
                FROM layouts l
                JOIN edition_dates ed ON ed.edition_id = l.edition_id AND ed.day_id = l.day_id
                JOIN events e ON e.edition_id = ed.edition_id AND e.date = ed.date
            )
            SELECT layout_id, min(event_id) AS event_id, count(*) AS match_count
            FROM matches
            GROUP BY layout_id
        """)
    )
    unresolved = [
        row[0]
        for row in bind.execute(
            sa.text("""
                SELECT l.id FROM layouts l
                LEFT JOIN _layout_event_map m ON m.layout_id = l.id AND m.match_count = 1
                WHERE m.layout_id IS NULL
            """)
        ).all()
    ]
    if unresolved:
        raise RuntimeError(
            "Cannot automatically determine event_id for layout(s): "
            f"{', '.join(unresolved)}. Their edition has no event on the matching "
            "day, or more than one event sharing that date. Set layouts.event_id "
            "manually for these rows, then re-run this migration."
        )

    op.add_column("layouts", sa.Column("event_id", sa.String(64), nullable=True))
    bind.execute(
        sa.text("""
            UPDATE layouts l SET event_id = m.event_id
            FROM _layout_event_map m WHERE m.layout_id = l.id
        """)
    )
    op.alter_column("layouts", "event_id", nullable=False)
    op.drop_column("layouts", "edition_id")
    op.drop_column("layouts", "day_id")
    op.create_foreign_key("layouts_event_id_fkey", "layouts", "events", ["event_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_layouts_event_id", "layouts", ["event_id"])
    op.create_unique_constraint("uq_layout_room_event", "layouts", ["room_id", "event_id"])

    op.create_table(
        "registration_allocations",
        sa.Column(
            "registration_id", sa.String(64), sa.ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("table_id", sa.String(64), sa.ForeignKey("tables.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("guest_count", sa.Integer(), nullable=False),
        sa.Column("exclusive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("guest_count >= 0", name="ck_allocation_guests"),
    )
    bind.execute(
        sa.text("""
            INSERT INTO registration_allocations (registration_id, table_id, guest_count, exclusive)
            SELECT id, table_id, guest_count, false FROM registrations WHERE table_id IS NOT NULL
        """)
    )
    op.drop_column("registrations", "table_id")
    op.create_index("ix_registration_allocations_table_id", "registration_allocations", ["table_id"])

    op.add_column("products", sa.Column("description", sa.String(300), nullable=False, server_default=""))

    # #1019: append-only payment ledger. A booking's amount_paid/payment_status
    # (above) are derived from this table's sums (see
    # app.services.payments_service.sync_registration_payment_fields) rather
    # than being mutable themselves.
    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "registration_id",
            sa.String(64),
            sa.ForeignKey("registrations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_by", sa.String(255), nullable=False),
        sa.Column("reference", sa.String(200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "reversed_transaction_id",
            sa.String(64),
            sa.ForeignKey("payment_transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint("kind IN ('payment', 'refund', 'correction')", name="ck_payment_transactions_kind"),
    )
    op.create_index("ix_payment_transactions_registration_id", "payment_transactions", ["registration_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_transactions_registration_id", table_name="payment_transactions")
    op.drop_table("payment_transactions")
    op.drop_column("products", "description")

    # The legacy schema can store only one table per registration. Preserve a
    # deterministic allocation before dropping the richer allocation rows.
    op.add_column(
        "registrations",
        sa.Column("table_id", sa.String(64), sa.ForeignKey("tables.id", ondelete="SET NULL"), nullable=True),
    )
    bind = op.get_bind()
    bind.execute(
        sa.text("""
            UPDATE registrations r
            SET table_id = (
                SELECT ra.table_id
                FROM registration_allocations ra
                WHERE ra.registration_id = r.id
                ORDER BY ra.table_id
                LIMIT 1
            )
        """)
    )
    op.create_index("ix_registrations_table_id", "registrations", ["table_id"])
    op.drop_table("registration_allocations")

    # Recover the legacy edition/day representation from the event that now
    # owns each layout. This is the inverse of the date-to-event mapping in
    # upgrade(), where a day meant the ordinal distinct event date per edition.
    op.add_column(
        "layouts",
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("layouts", sa.Column("day_id", sa.Integer(), nullable=True))
    bind.execute(
        sa.text("""
            WITH edition_dates AS (
                SELECT edition_id, date, row_number() OVER (PARTITION BY edition_id ORDER BY date) AS day_id
                FROM (SELECT DISTINCT edition_id, date FROM events) AS d
            )
            UPDATE layouts l
            SET edition_id = e.edition_id, day_id = ed.day_id
            FROM events e
            JOIN edition_dates ed ON ed.edition_id = e.edition_id AND ed.date = e.date
            WHERE e.id = l.event_id
        """)
    )
    op.alter_column("layouts", "day_id", nullable=False)
    op.drop_constraint("uq_layout_room_event", "layouts")
    op.drop_index("ix_layouts_event_id", "layouts")
    op.drop_column("layouts", "event_id")
    op.drop_constraint("ck_product_unit", "products")
    op.drop_constraint("ck_product_stock", "products")
    for column in ("unit", "stock", "inclusions"):
        op.drop_column("products", column)
    op.drop_column("registrations", "amount_paid")
    op.drop_column("registrations", "product_snapshot")
    # Notes cannot be split reliably; retain all content in notes on rollback.
    op.add_column("registrations", sa.Column("accessibility_note", sa.Text(), nullable=False, server_default=""))

    # #953: restoring users.oidc_subject to NOT NULL below would violate that
    # constraint for any visitor account (magic-link sign-in, oidc_subject IS
    # NULL by design). Fail loudly with an operational precondition rather
    # than silently deleting those accounts and their registration ownership,
    # or letting Postgres abort mid-migration with a raw constraint error
    # (PR #1012 review).
    visitor_user_count = bind.execute(sa.text("SELECT COUNT(*) FROM users WHERE oidc_subject IS NULL")).scalar()
    if visitor_user_count:
        raise RuntimeError(
            f"Cannot downgrade past 001: {visitor_user_count} visitor account(s) "
            "(#953 magic-link sign-in, users.oidc_subject IS NULL) exist. "
            "Downgrading restores oidc_subject to NOT NULL, which these rows "
            "violate. Resolve them first (e.g. delete the accounts, accepting "
            "the loss of their registration ownership) before downgrading."
        )
    op.drop_index("ix_composed_messages_state", table_name="composed_messages")
    op.drop_table("composed_messages")
    op.drop_index("ix_push_subscriptions_last_seen_at", table_name="push_subscriptions")
    op.drop_index("ix_push_subscriptions_endpoint", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_index("ix_visitor_sessions_hard_expires_at", table_name="visitor_sessions")
    op.drop_index("ix_visitor_sessions_expires_at", table_name="visitor_sessions")
    op.drop_index("ix_visitor_sessions_user_id", table_name="visitor_sessions")
    op.drop_index("ix_visitor_sessions_session_hash", table_name="visitor_sessions")
    op.drop_table("visitor_sessions")
    op.drop_table("visitor_magic_links")
    op.drop_constraint("ck_users_exactly_one_identity", "users", type_="check")
    op.drop_index("ix_users_verified_email", table_name="users")
    op.drop_column("users", "verified_email")
    op.alter_column("users", "oidc_subject", nullable=False)
    op.drop_table("rate_limit_buckets")
    op.drop_column("people", "marketing_opt_in_at")
    op.drop_column("people", "marketing_opt_in")
    op.drop_table("policy_versions")
    op.drop_table("policies")
    op.drop_table("announcements")
    op.drop_constraint("ck_people_preferred_language", "people", type_="check")
    op.drop_column("people", "preferred_language")
    op.drop_column("events", "registrations_close_at")
    op.add_column(
        "tables",
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="4"),
    )
    op.alter_column("table_types", "capacity", new_column_name="max_capacity")
    op.add_column(
        "tables",
        sa.Column("reservation_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.drop_index("ix_delivery_attempts_job_id", table_name="delivery_attempts")
    op.drop_table("delivery_attempts")
    op.drop_index("ix_outbox_jobs_scheduled_at", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_state", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_resource_id", table_name="outbox_jobs")
    op.drop_index("ix_outbox_jobs_job_type", table_name="outbox_jobs")
    op.drop_table("outbox_jobs")
    op.drop_column("app_settings", "facebook_url")
    op.drop_column("app_settings", "public_phone")
    op.drop_column("app_settings", "public_email")
    op.drop_index("ix_contact_messages_created_at", table_name="contact_messages")
    op.drop_table("contact_messages")
