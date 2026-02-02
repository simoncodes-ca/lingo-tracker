# Angular UI Architecture - Components & Services

## Component Hierarchy

```mermaid
graph TB
    subgraph App["🎯 Root Component"]
        ROOT["app.ts<br/>Router Outlet"]
    end

    subgraph Collections["📋 Collections Module"]
        COLLECTIONS_MGR["CollectionsManager"]
        COLLECTION_FORM["CollectionFormDialog"]
    end

    subgraph Header["🎨 Top Navigation"]
        APP_HEADER["AppHeader"]
        THEME_SWITCHER["Theme Control<br/>(Light/Dark/System)"]
    end

    subgraph Browser["🌐 Translation Browser"]
        BROWSER_ROOT["TranslationBrowser<br/>(Master-Detail Layout)"]

        subgraph Sidebar["📁 Sidebar"]
            SIDEBAR_HEADER["SidebarHeader"]
            FOLDER_TREE["FolderTree<br/>(Hierarchical Navigation)"]
            FOLDER_NODE["FolderNode<br/>(Recursive)"]
            INLINE_FOLDER_INPUT["InlineFolderInput<br/>(Create Folder)"]
            LOCALE_FILTER["LocaleFilter<br/>(Multi-select)"]
            STATUS_FILTER["StatusFilter<br/>(new/translated/stale/verified)"]
            TRANSLATION_SEARCH["TranslationSearch<br/>(Global Search)"]
        end

        subgraph MainContent["📝 Main Content"]
            MAIN_HEADER["TranslationMainHeader<br/>(Breadcrumb & Controls)"]
            TRANSLATION_LIST["TranslationList<br/>(Virtual Scrolled List)"]
            TRANSLATION_ITEM["TranslationItem"]
            ITEM_HEADER["ItemHeader<br/>(Key & Status)"]
            ITEM_LOCALES["ItemLocales<br/>(Translated Values)"]
            ITEM_CONTROLS["ItemCompactControls"]
            TRANSLATION_ROLLUP["TranslationRollup<br/>(Aggregated State)"]
        end

        subgraph Dialogs["💬 Modal Dialogs"]
            EDITOR_DIALOG["TranslationEditorDialog<br/>(Create/Edit)"]
            FOLDER_PICKER["FolderPicker"]
            SIMILAR_WARNING["SimilarResourcesWarning"]
            MOVE_DIALOG["MoveResourceDialog"]
            CONFIRM_DIALOG["ConfirmationDialog<br/>(Delete)"]
        end

        subgraph UIComponents["🔘 UI Components"]
            COMMENT_POPOVER["CommentPopover"]
            TAG_LIST_POPOVER["TagListPopover"]
            INDEXING_OVERLAY["IndexingOverlay<br/>(Loading State)"]
            SEARCH_INPUT["SearchInput"]
            TAG_LIST["TagList"]
        end
    end

    subgraph Pipes["🔄 Pipes"]
        HIGHLIGHT_PIPE["HighlightPipe<br/>(Search Highlighting)"]
        TRUNCATE_PIPE["TruncateKeyPipe<br/>(Key Truncation)"]
    end

    %% App Structure
    ROOT --> Collections
    ROOT --> Header
    ROOT --> Browser

    %% Header
    Header --> APP_HEADER
    APP_HEADER --> THEME_SWITCHER

    %% Collections
    Collections --> COLLECTIONS_MGR
    COLLECTIONS_MGR -.->|launch dialog| COLLECTION_FORM

    %% Browser Structure
    Browser --> BROWSER_ROOT
    BROWSER_ROOT --> Sidebar
    BROWSER_ROOT --> MainContent
    BROWSER_ROOT --> Dialogs
    BROWSER_ROOT --> UIComponents

    %% Sidebar Components
    Sidebar --> SIDEBAR_HEADER
    Sidebar --> FOLDER_TREE
    FOLDER_TREE --> FOLDER_NODE
    FOLDER_NODE -->|recursive| FOLDER_NODE
    FOLDER_NODE --> INLINE_FOLDER_INPUT
    Sidebar --> LOCALE_FILTER
    Sidebar --> STATUS_FILTER
    Sidebar --> TRANSLATION_SEARCH

    %% Main Content
    MainContent --> MAIN_HEADER
    MAIN_HEADER --> TRANSLATION_SEARCH
    MAIN_HEADER --> LOCALE_FILTER
    MAIN_HEADER --> STATUS_FILTER
    MainContent --> TRANSLATION_LIST
    TRANSLATION_LIST --> TRANSLATION_ITEM
    TRANSLATION_ITEM --> ITEM_HEADER
    TRANSLATION_ITEM --> ITEM_LOCALES
    TRANSLATION_ITEM --> ITEM_CONTROLS
    TRANSLATION_ITEM --> TRANSLATION_ROLLUP
    TRANSLATION_ITEM -->|pipes| HIGHLIGHT_PIPE
    TRANSLATION_ITEM -->|pipes| TRUNCATE_PIPE

    %% Dialogs
    TRANSLATION_ITEM -.->|launch| EDITOR_DIALOG
    TRANSLATION_ITEM -.->|launch| MOVE_DIALOG
    TRANSLATION_ITEM -.->|launch| CONFIRM_DIALOG
    EDITOR_DIALOG --> FOLDER_PICKER
    EDITOR_DIALOG --> SIMILAR_WARNING
    FOLDER_PICKER --> FOLDER_TREE

    %% UI Components
    TRANSLATION_ITEM -.->|popover| COMMENT_POPOVER
    TRANSLATION_ITEM -.->|popover| TAG_LIST_POPOVER
    UIComponents --> TAG_LIST
    Browser -.->|full screen| INDEXING_OVERLAY

    style App fill:#e1f5ff
    style Collections fill:#f3e5f5
    style Header fill:#fff3e0
    style Browser fill:#e8f5e9
    style Sidebar fill:#f1f8e9
    style MainContent fill:#fce4ec
    style Dialogs fill:#ede7f6
    style UIComponents fill:#e0f2f1
    style Pipes fill:#fff9c4
```

## Service Dependencies

```mermaid
graph LR
    subgraph Stores["🏪 NgRx Signals Stores"]
        COLLECTIONS_STORE["CollectionsStore<br/>Collections Management"]
        BROWSER_STORE["BrowserStore<br/>Translation Browsing"]
    end

    subgraph APIServices["🔌 API Services"]
        COLLECTIONS_API["CollectionsApiService"]
        BROWSER_API["BrowserApiService"]
    end

    subgraph SharedServices["🎯 Shared Services"]
        THEME_SERVICE["ThemeService<br/>(Light/Dark/System)"]
        TRANSLOCO_SERVICE["TranslocoService<br/>(i18n)"]
        TRANSLOCO_LOADER["TranslocoHttpLoader"]
    end

    subgraph Infrastructure["⚙️ Angular"]
        HTTP_CLIENT["HttpClient"]
        ROUTER["Router"]
        MAT_DIALOG["MatDialog"]
        LOCAL_STORAGE["localStorage"]
    end

    %% Store Dependencies
    COLLECTIONS_STORE -->|uses| COLLECTIONS_API
    BROWSER_STORE -->|uses| BROWSER_API
    BROWSER_STORE -->|persists| LOCAL_STORAGE

    %% API Services
    COLLECTIONS_API -->|HTTP| HTTP_CLIENT
    BROWSER_API -->|HTTP| HTTP_CLIENT

    %% Component Injections
    Collections -->|inject| COLLECTIONS_STORE
    Browser -->|inject| COLLECTIONS_STORE
    Browser -->|inject| BROWSER_STORE
    APP_HEADER -->|inject| THEME_SERVICE
    TRANSLATION_ITEM -->|inject| MAT_DIALOG

    %% Service Dependencies
    THEME_SERVICE -->|reads/writes| LOCAL_STORAGE
    THEME_SERVICE -->|listens| window.matchMedia
    TRANSLOCO_SERVICE -->|uses| TRANSLOCO_LOADER
    TRANSLOCO_LOADER -->|HTTP| HTTP_CLIENT

    style Stores fill:#c8e6c9
    style APIServices fill:#bbdefb
    style SharedServices fill:#ffe0b2
    style Infrastructure fill:#f0f4c3
```

## Store Architecture - CollectionsStore

```mermaid
graph TB
    subgraph CollectionsStore["CollectionsStore State"]
        State["State:<br/>• config<br/>• isLoading<br/>• error"]
        Computed["Computed:<br/>• collectionEntries<br/>• collectionEntriesWithLocales<br/>• hasCollections"]
    end

    subgraph CollectionsMethods["Store Methods"]
        LoadCollections["loadCollections()"]
        CreateCollection["createCollection(name, config)"]
        UpdateCollection["updateCollection(name, config)"]
        DeleteCollection["deleteCollection(name)"]
    end

    State --> Computed
    Computed --> CollectionsMethods

    style CollectionsStore fill:#c8e6c9
    style CollectionsMethods fill:#a5d6a7
```

## Store Architecture - BrowserStore

```mermaid
graph TB
    subgraph BrowserState["BrowserStore State"]
        CollectionState["📦 Collection State<br/>• selectedCollection<br/>• availableLocales<br/>• baseLocale"]

        FolderState["📁 Folder Navigation<br/>• currentFolderPath<br/>• expandedFolders<br/>• rootFolders<br/>• folderTreeFilter<br/>• isFolderTreeLoading<br/>• isAddingFolder"]

        TranslationState["📝 Translation Display<br/>• translations[]<br/>• isTranslationsLoading<br/>• showNestedResources"]

        SearchState["🔍 Search<br/>• searchQuery<br/>• isSearchMode<br/>• searchResults[]<br/>• isSearchLoading"]

        ViewState["🎨 View Preferences<br/>• densityMode (compact|medium|full)<br/>• compactLocale<br/>• sortField (key|status)<br/>• sortDirection<br/>• selectedStatuses[]"]

        CacheState["💾 Cache & Stats<br/>• cacheStatus<br/>• collectionStats"]

        UIState["🖥️ UI State<br/>• isDisabled<br/>• error<br/>• selectedLocales"]
    end

    subgraph BrowserComputed["Computed Signals"]
        FilteredFolders["filteredFolders()"]
        Breadcrumbs["breadcrumbs()"]
        DisplayedTranslations["displayedTranslations()"]
        SortedTranslations["sortedTranslations()"]
        FilteredLocales["filteredLocales()"]
        TranslationCount["translationCount()"]
        CacheReady["isCacheReady()"]
        CanShowMultiple["canShowMultipleLocales()"]
    end

    subgraph BrowserMethods["RxMethods - Async Operations"]
        SelectFolder["selectFolder(path)"]
        LoadRootFolders["loadRootFolders()"]
        LoadFolderChildren["loadFolderChildren(path)"]
        SearchTranslations["searchTranslations(query)"]
        CheckCache["checkCacheStatus()"]
        CreateFolder["createFolder(parentPath, name)"]
        SetCollection["setSelectedCollection(name)"]
    end

    subgraph BrowserFilters["Sync Methods - Filters & View"]
        SetDensity["setDensityMode(mode)"]
        SetLocales["setSelectedLocales(locales[])"]
        SetStatus["setSelectedStatuses(statuses[])"]
        SetSort["setSort(field, direction)"]
        ToggleNested["toggleShowNestedResources()"]
        SetCompactLocale["setCompactLocale(locale)"]
    end

    subgraph Persistence["💾 Persistence"]
        SavePrefs["Auto-saved to localStorage<br/>Key: lingo-tracker:view-prefs:{collectionName}"]
        RestorePrefs["Auto-restored on collection selection"]
    end

    BrowserState --> BrowserComputed
    BrowserState --> BrowserMethods
    BrowserState --> BrowserFilters
    BrowserMethods --> Persistence
    BrowserFilters --> Persistence

    style BrowserState fill:#bbdefb
    style BrowserComputed fill:#90caf9
    style BrowserMethods fill:#64b5f6
    style BrowserFilters fill:#42a5f5
    style Persistence fill:#f8bbd0
```

## API Endpoints Used by UI

```mermaid
graph LR
    API["NestJS API<br/>/api"]

    Config["GET /config"]
    Collections["POST /collections/:name<br/>GET /collections/:name<br/>PUT /collections/:name<br/>DELETE /collections/:name"]
    Resources["GET /collections/:name/resources/tree<br/>GET /collections/:name/resources/search<br/>POST /collections/:name/resources<br/>PATCH /collections/:name/resources/:id<br/>DELETE /collections/:name/resources/:id"]
    Folders["POST /collections/:name/folders"]
    Cache["GET /collections/:name/resources/cache/status"]

    API --> Config
    API --> Collections
    API --> Resources
    API --> Folders
    API --> Cache

    Config -.->|CollectionsStore| COLLECTIONS_STORE
    Collections -.->|CollectionsStore| COLLECTIONS_STORE
    Resources -.->|BrowserStore| BROWSER_STORE
    Folders -.->|BrowserStore| BROWSER_STORE
    Cache -.->|BrowserStore| BROWSER_STORE

    style API fill:#ffccbc
    style Config fill:#ffe0b2
    style Collections fill:#ffd699
    style Resources fill:#ffcc80
    style Folders fill:#ffb74d
    style Cache fill:#ffa726
```
