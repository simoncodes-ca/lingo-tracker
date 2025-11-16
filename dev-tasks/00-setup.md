# Phase 0: Project Setup

## CLI Project
- [x] Create NX workspace for a modern Typescript library that will be used to process command line commands using a modern and popular cli library
- [x] Create init command
  - [x] look for presence of .lingo-tracker.json file in current folder. If it is found pretty print that Lingo Tracker is already initialized and there is nothing to do.
  - [x] Perform initialization by asking the user for translationsFolder, exportFolder (default value: dist/lingo-export), importFolder (default value: dist/lingo-import), if they are not passed as command line arguments.  Finally create `.lingo-tracker.json` with those values in current folder.
- [x] Add baseLocale argument and property to the init command with default value of en
- [x] Add locales array of string argument and property to the init command with default value of empty array

## Core Library
- [x] Create a pure modern Typescript library (with vitest) that will be shared by API and CLI packages
- [x] Move all interfaces and constants from packages/cli/src/lib to the core library and update code to use values from that library

## Data Transfer Library
- [x] Create a pure modern Typescript library (with vitest) that will be shared by API and tracker App packages

## API
- [x] Add version 11.1.6 of NestJs project (use context7 if necessary)
- [x] Add GET health API end point that responds with `all is good`
- [x] Add GET config API end point that will read and return contents of `.lingo-tracker.json` (if file doesn't exist it should return 404 error). Use common library to get constant values
  - [x] Create Config service that deals with loading the configuration file and update the config API end point to get value from this service

## App
- [x] Create a project for Angular 20.3.1 application with routing, using vitest for unit testing and using SCSS for styling
- [x] Add Angular Material Material Components version 20.2.4 to it
- [x] Add Angular Component Development Kit version 20.2.4
- [x] Add Spectator Angular testing framework
- [x] Add Transloco library
- [x] Create a basic layout for app component with top bar that has title `Lingo Tracker` and a pill with version number of the app.  For the body just display an h2 with "Under construction"
- [x] Create light and dark theme using Angular Material $violet-palette palette as base
- [x] Add a light/dark switch to the application header (on the right side)

## Connect Things
- [x] - Configure tracker app to run with proxy conf in development mode
- [x] - Configure api to serve static files (serve built version of tracker app)
- [x] - Call health api from tracker app and display results