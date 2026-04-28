# Changelog

## 1.5.8

- Fix stale HA version display — version is now refreshed from HA on every sync

## 1.5.7

- Fix deploy dialog too narrow — override sm:max-w-sm default so the dialog actually uses the full 2xl width
- Fix deploy failing for device triggers — entity registry UIDs were incorrectly treated as entity IDs during validation

## 1.5.6

- Fix horizontal overflow in deploy automation dialog — long entity IDs and YAML no longer require sideways scrolling
- Fix EventSource replaced with fetch streaming for HA Ingress compatibility

## 1.5.5

- SSE streaming for analysis progress with real-time category updates
- Fix max_tokens restored to 8192, add truncation recovery
- Optimize AI costs with ~95% reduction
- Fix Claude model names and add JSON fence stripping

## 1.5.0

- Add Automation Coach, Coverage Map, Builder Wizard, Dependency Graph, Simulator, Templates Library, and Notifications
- Fix Docker cache-buster so HA add-on rebuilds with new code

## 1.4.2

- Fix build context and run.sh path in HA add-on Dockerfile

## 1.4.1

- Fix ThemeProvider context error
