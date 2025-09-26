# Feature: Support translation collections

In a monorepo context it maybe desirable to have multiple translation collections (translation sources) that lingo tracker should handle.

## TODO
- [ ] Update application configuration to handle multiple collections
  - [ ] Create a new interface LingoTrackerCollection from LingoTrackerConfig
  - [ ] Add collections property to LingoTrackerConfig
  - [ ] Update init cli command to ask for collection name
- [ ] Add ability to add new collection via CLI
- [ ] The app should load the configuration, then present a card list of collections to the user to pick (if there is only one collection then proceed).  The next view should show collection name.
- [ ] The user should be be able to switch (or navigate to collections card list view) collections.