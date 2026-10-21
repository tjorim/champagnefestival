# Uploaded file storage contract

Champagnefestival keeps uploaded files in three volumes beside its database:
accepted organisation logos (`uploads/public/organizations`), pending logos
(`uploads/pending/organizations`) and edition artwork, with signage images in
its `signage/` subdirectory (`uploads/public/editions`). The private signage MP4
exports are not backed up (see `signage-api.md`).

The apps backup captures the database and these volumes as one unit while the
API and worker keep running (tjorim/apps#245): it takes the advisory locks
below, pins a PostgreSQL snapshot, hardlinks each volume, releases the locks,
and then takes the dump and archives. That is only consistent because every
writer keeps these rules. Treat them as an interface: a change that breaks one
can produce backups whose database and files disagree, and nothing fails until
a restore.

## Rules

1. **Fresh name per file.** `organization_logos.store` names every file
   `<uuid>-<sha256>.<ext>` and opens it with `xb`; a file is never rewritten in
   place or reused under another reference.
2. **Write before commit, delete after commit.** A file is written in full
   before the row referencing it commits, and removed again if the transaction
   rolls back. An obsolete file is removed only after the commit that drops its
   last reference (`defer_delete`).
3. **Hold the feature's advisory lock for every change.** Every transaction
   that writes a file, or adds or drops a reference to one, holds the
   transaction-scoped PostgreSQL advisory lock of its feature before it does
   so:

   | Key | Feature | Taken by |
   |---|---|---|
   | 1194 | Organisation logos (public and pending) | `organization_logos.lock`, via `organization_changes.lock_organization` |
   | 1224 | Edition artwork | `edition_artwork.lock` |
   | 1261 | Signage (images are only ever added) | `signage_service.lock` |

   The backup holds all three while it pins its snapshot and links the
   volumes, so no reference changes in between and no file is caught half
   written. `scripts/backup-vps.sh` in tjorim/apps names these keys: do not
   renumber a lock, or add a writer that skips it, without changing the backup.
4. **No dot-entries.** File names never start with a dot. The backup links each
   volume into `.backup-snapshot/` inside it for a moment; the reconcilers only
   touch names matching their managed pattern, and new code must not list a
   root assuming it holds only managed files.

A new feature that stores files must keep these rules and either use one of
these volumes under its feature's lock, or add its own volume and lock to the
apps backup.

## After a restore

Restore the database and all three archives from the same snapshot, then run
the reconcilers (`python -m app.services.organization_logos` and
`python -m app.services.edition_artwork`) to remove files the restored
database no longer references.
