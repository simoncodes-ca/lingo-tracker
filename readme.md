# LingoTracker
**"Effortlessly Track, Validate, and Manage Your Translations."**

Welcome to LingoTracker, the ultimate companion to the excellent [Transloco](https://github.com/jsverse/transloco) library! LingoTracker is designed for anyone looking to efficiently manage translation resources.

## Why Is LingoTracker Awesome?
### Metadata Aware
With LingoTracker, you can effortlessly track which resources need translation and identify stale entries. For instance, if a value in your base language changes, all corresponding locale values are automatically marked as stale. This prevents drift in meaning across all languages and ensures consistency in your translations.

### Git Friendly
LingoTracker stores all translations and metadata as JSON files, making it a breeze to review changes in pull requests. Collaborate seamlessly with your team and keep your translation resources organized!

### Browse Resources
Gone are the days of sifting through massive JSON files or countless Resx files. LingoTracker comes equipped with a user-friendly interface that allows you to browse all your translation resources efficiently, providing unified access regardless of the size of your data.

### Scalable
LingoTracker is designed with scalability in mind. By storing metadata in separate files and allowing flexible splitting of resources into nested folders, you can manage even the largest resource sets with ease.

### ICU Format Validation
Tired of dealing with incorrect variable names or placeholders in ICU message format? LingoTracker has your back! Our built-in validation checks your translations, ensuring accuracy and correctness, putting such hassles in the past.

### Type Safety
Experience compile-time guarantees with generated translation key tokens. This feature ensures that your application uses the correct and valid translation keys, along with type completion, adding an extra layer of confidence to your translations.

### CLI Support
Fully backed by a powerful Command Line Interface, LingoTracker allows for easy CI integration. Validate your resources prior to a release, making sure everything is in tip-top shape before going live!

### Extensibility
The rich API that drives LingoTracker’s UI can also be leveraged in other tools or custom IDE plugins, allowing you to tailor your development experience to your needs.

### Flexibility
Import and export your resource data in various formats, including JSON and XLIFF. LingoTracker gives you complete control over how you manage and bundle resources for your application. Use tags to segment resources or unify them into a single system that works for you.

### Linking Made Easy
You can easily link resources from different projects or shared resources using symlinks. This feature enhances collaboration and streamlines your workflow.

## Get Started
Check the [documentation](link-to-docs) for detailed usage instructions, setup configurations, and tips to maximize your experience with LingoTracker.

## Contributing
We welcome contributions! Please read our [contributing guidelines](link-to-contrib-guidelines) for more information.

## License
LingoTracker is licensed under the [MIT License](link-to-license).

---
Join us today and redefine the way you manage translations with LingoTracker!