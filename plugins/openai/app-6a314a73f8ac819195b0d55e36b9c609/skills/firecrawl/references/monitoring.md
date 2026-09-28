# Monitor website changes

Use monitors for a user-requested recurring check or change alert. Identify
the target URLs or search queries, the change of interest, and the schedule.
Use only notification destinations the user has supplied or authorized.

- `firecrawl_monitor_list` finds existing monitors.
- `firecrawl_monitor_get` retrieves one monitor's configuration.
- `firecrawl_monitor_create` creates a monitor once its target and schedule
  are known. When queries and URLs are both supplied, queries take precedence;
  choose the target mode that matches the request.
- `firecrawl_monitor_update` changes an existing monitor. Inspect its current
  configuration first and preserve settings outside the requested change.
- `firecrawl_monitor_run` starts an immediate check.
- `firecrawl_monitor_checks` lists recorded checks for a monitor.
- `firecrawl_monitor_check` retrieves one check's result or diff using the
  identifiers returned by the service.
- `firecrawl_monitor_delete` removes the monitor the user asked to remove.

Do not create a duplicate when updating or checking an existing monitor. An
accepted run is not evidence of a detected change; read its check result before
reporting one. Confirm creation or updates from the returned configuration.
