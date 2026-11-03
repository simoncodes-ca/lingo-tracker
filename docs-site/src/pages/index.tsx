import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import darkScreenshot from '@site/../docs/images/translation-browser-dark.png';
import lightScreenshot from '@site/../docs/images/translation-browser-light.png';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';
import type { ReactNode } from 'react';
import styles from './index.module.css';

const tourVideo = 'https://github.com/user-attachments/assets/e798cf3c-e11f-4666-8521-e48338831ba7';

const headline = 'Catch stale and unreviewed translations in CI, not in production.';

const benefits: { title: string; body: ReactNode }[] = [
  {
    title: 'Gate the release.',
    body: (
      <>
        <code>validate</code> fails CI on missing, stale or unreviewed strings.
      </>
    ),
  },
  {
    title: 'Generate runtime bundles.',
    body: (
      <>
        <code>bundle</code> writes one JSON file per locale from any mix of collections, key patterns and tags.
      </>
    ),
  },
  {
    title: 'Translate and review strings.',
    body: (
      <>
        Export <code>new</code> and <code>stale</code> strings as XLIFF 1.2 or JSON.
      </>
    ),
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const tourPoster = useBaseUrl('/img/lingotracker-1.0-tour.jpg');
  const tourCaptions = useBaseUrl('/video/lingotracker-1.0-tour.en.vtt');

  return (
    <Layout title={siteConfig.tagline} description={siteConfig.tagline}>
      <main>
        <header className={styles.hero}>
          <div className="container">
            <h1 className={styles.headline}>{headline}</h1>
            <p className={styles.subtitle}>{siteConfig.tagline}.</p>
            <div className={styles.actions}>
              <Link className={`button button--lg ${styles.primary}`} to="/docs/getting-started">
                Get started
              </Link>
              <Link
                className={`button button--lg ${styles.secondary}`}
                href="https://github.com/simoncodes-ca/lingo-tracker"
              >
                GitHub
              </Link>
            </div>
            <div className={styles.install}>
              <CodeBlock language="bash">pnpm add -D @simoncodes-ca/lingo-tracker</CodeBlock>
            </div>
          </div>
        </header>

        <section className={styles.screenshotSection}>
          <div className="container">
            <div className={styles.frame}>
              <ThemedImage
                className={styles.screenshot}
                alt="LingoTracker translation browser: fr-ca translations for the checkout keys of a storefront collection, with stale, new, translated and verified statuses"
                sources={{ light: lightScreenshot, dark: darkScreenshot }}
              />
            </div>
          </div>
        </section>

        <section className={styles.videoSection} aria-labelledby="tour">
          <div className="container">
            <h2 id="tour" className={styles.videoHeading}>
              LingoTracker 1.0 in 90 seconds
            </h2>
            <div className={styles.frame}>
              <video className={styles.video} controls preload="none" playsInline poster={tourPoster} src={tourVideo}>
                <track kind="captions" src={tourCaptions} srcLang="en" label="English" />
                <a href={tourVideo}>Watch the LingoTracker 1.0 tour</a>
              </video>
            </div>
          </div>
        </section>

        <section className={styles.benefits} aria-labelledby="why-use-it">
          <div className="container">
            <h2 id="why-use-it" className={styles.benefitsHeading}>
              Why use it
            </h2>
            <div className={styles.benefitGrid}>
              {benefits.map(({ title, body }) => (
                <div key={title} className={styles.benefit}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
