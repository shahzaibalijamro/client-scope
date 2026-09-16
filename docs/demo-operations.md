# Public Demo Operations

## Enable or disable

Configure every `DEMO_*` value documented in `backend/.env.example`, then set `DEMO_MODE_ENABLED=true`. An incomplete or unsafe configuration fails closed and logs only invalid field names. To disable the demo, set the flag to `false` and redeploy; the reset endpoint and public credentials disappear and ordinary application behavior returns.

## Reset and recovery

GitHub Actions calls the fixed HTTPS reset URL every six hours and through manual dispatch. The request carries only the reset bearer secret and a schedule hint; it cannot select a tenant or folder. A second invocation receives the active-lease response. If a process dies, the five-minute lease expires and the next invocation can recover.

Database cutover is transactional. A pre-cutover failure retains the previous coherent story; a committed cutover exposes the new generation. Asset cleanup failure does not roll back data. Inspect safe `demo.reset_*` diagnostics, correct provider availability, and rerun the workflow so recorded cleanup work can be retried.

## Secrets and quotas

Rotate the two public passwords, reset secret, Gmail App Password, Gemini key, and Cloudinary credentials only in their deployment secret stores. Redeploy after rotation; never paste values into workflow inputs, logs, screenshots, or validation evidence. Configure higher or lower positive quota ceilings only after confirming the daily ceiling remains at least the per-user hourly ceiling.
