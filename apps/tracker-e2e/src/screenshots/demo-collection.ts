import type { CreateResourceDto, TranslationStatus, UpdateResourceDto } from '@simoncodes-ca/data-transfer';

export const DEMO_COLLECTION = 'storefront';
export const DEMO_LOCALES = ['en', 'fr-ca', 'de', 'ja'] as const;

type TargetLocale = 'fr-ca' | 'de' | 'ja';
type Translation = readonly [value: string, status: TranslationStatus];

interface DemoEntry {
  key: string;
  en: string;
  comment?: string;
  /** A locale left out is seeded as a `new` copy of the base value. */
  translations: Partial<Record<TargetLocale, Translation>>;
}

const verified = (value: string): Translation => [value, 'verified'];
const translated = (value: string): Translation => [value, 'translated'];

export const demoEntries: readonly DemoEntry[] = [
  // checkout
  {
    key: 'checkout.title',
    en: 'Checkout',
    translations: { 'fr-ca': verified('Passer à la caisse'), de: verified('Zur Kasse'), ja: verified('レジに進む') },
  },
  {
    key: 'checkout.placeOrder',
    en: 'Place order',
    comment: 'Primary button on the final checkout step',
    translations: {
      'fr-ca': verified('Passer la commande'),
      de: verified('Jetzt kaufen'),
      ja: verified('注文を確定する'),
    },
  },
  {
    key: 'checkout.backToCart',
    en: 'Back to cart',
    translations: {
      'fr-ca': verified('Retour au panier'),
      de: verified('Zurück zum Warenkorb'),
      ja: verified('カートに戻る'),
    },
  },
  {
    key: 'checkout.orderSummary',
    en: 'Order summary',
    translations: {
      'fr-ca': verified('Résumé de la commande'),
      de: verified('Bestellübersicht'),
      ja: translated('ご注文内容'),
    },
  },
  {
    key: 'checkout.confirmation.thanks',
    en: 'Thank you for your order, {name}!',
    comment: '{name} is the customer’s first name',
    translations: {
      'fr-ca': verified('Merci pour votre commande, {name} !'),
      de: verified('Vielen Dank für Ihre Bestellung, {name}!'),
      ja: verified('{name}様、ご注文ありがとうございます。'),
    },
  },
  {
    key: 'checkout.shipping.title',
    en: 'Shipping address',
    translations: {
      'fr-ca': verified('Adresse de livraison'),
      de: verified('Lieferadresse'),
      ja: verified('お届け先住所'),
    },
  },
  {
    key: 'checkout.shipping.method',
    en: 'Delivery method',
    translations: { 'fr-ca': verified('Mode de livraison'), de: verified('Versandart'), ja: verified('配送方法') },
  },
  {
    key: 'checkout.shipping.standard',
    en: 'Standard (5–7 business days)',
    translations: {
      'fr-ca': verified('Standard (5 à 7 jours ouvrables)'),
      de: verified('Standard (5–7 Werktage)'),
      ja: verified('通常配送（営業日で5～7日）'),
    },
  },
  {
    key: 'checkout.shipping.express',
    en: 'Express (2 business days)',
    translations: {
      'fr-ca': translated('Express (2 jours ouvrables)'),
      de: translated('Express (2 Werktage)'),
      ja: translated('お急ぎ便（営業日で2日）'),
    },
  },
  {
    key: 'checkout.shipping.freeThreshold',
    en: 'Free shipping on orders over {amount}',
    translations: {
      'fr-ca': verified('Livraison gratuite pour toute commande de plus de {amount}'),
      de: verified('Kostenloser Versand bei Bestellungen über {amount}'),
      ja: verified('{amount}を超えるご注文で送料無料'),
    },
  },
  {
    key: 'checkout.shipping.estimate',
    en: 'Estimated delivery: {date}',
    translations: {
      'fr-ca': translated('Livraison estimée : {date}'),
      de: translated('Voraussichtliche Lieferung: {date}'),
      ja: translated('お届け予定日：{date}'),
    },
  },
  {
    key: 'checkout.payment.title',
    en: 'Payment method',
    translations: { 'fr-ca': verified('Mode de paiement'), de: verified('Zahlungsart'), ja: verified('お支払い方法') },
  },
  {
    key: 'checkout.payment.cardNumber',
    en: 'Card number',
    translations: { 'fr-ca': verified('Numéro de carte'), de: verified('Kartennummer'), ja: verified('カード番号') },
  },
  {
    key: 'checkout.payment.expiry',
    en: 'Expiry date',
    translations: {
      'fr-ca': verified('Date d’expiration'),
      de: verified('Ablaufdatum'),
      ja: verified('有効期限'),
    },
  },
  {
    key: 'checkout.payment.securityCode',
    en: 'Security code',
    translations: {
      'fr-ca': verified('Code de sécurité'),
      de: verified('Sicherheitscode'),
      ja: verified('セキュリティコード'),
    },
  },
  {
    key: 'checkout.payment.saveCard',
    en: 'Save this card for future purchases',
    // Untranslated everywhere, so the fr-ca view shows a `new` entry.
    translations: {},
  },
  {
    key: 'checkout.payment.promoCode',
    en: 'Promo code',
    translations: { 'fr-ca': verified('Code promotionnel'), de: translated('Gutscheincode') },
  },
  // cart
  {
    key: 'cart.title',
    en: 'Your cart',
    translations: { 'fr-ca': verified('Votre panier'), de: verified('Ihr Warenkorb'), ja: verified('カート') },
  },
  {
    key: 'cart.empty',
    en: 'Your cart is empty',
    translations: {
      'fr-ca': verified('Votre panier est vide'),
      de: verified('Ihr Warenkorb ist leer'),
      ja: verified('カートは空です'),
    },
  },
  {
    key: 'cart.continueShopping',
    en: 'Continue shopping',
    translations: {
      'fr-ca': verified('Poursuivre vos achats'),
      de: verified('Weiter einkaufen'),
      ja: verified('買い物を続ける'),
    },
  },
  {
    key: 'cart.remove',
    en: 'Remove',
    translations: { 'fr-ca': verified('Retirer'), de: verified('Entfernen'), ja: verified('削除') },
  },
  {
    key: 'cart.summary.itemCount',
    en: '{count, plural, one {# item} other {# items}}',
    comment: 'ICU plural. Japanese has a single plural category.',
    translations: {
      'fr-ca': verified('{count, plural, one {# article} other {# articles}}'),
      de: verified('{count, plural, one {# Artikel} other {# Artikel}}'),
      ja: verified('{count, plural, other {#点}}'),
    },
  },
  {
    key: 'cart.summary.subtotal',
    en: 'Subtotal',
    translations: { 'fr-ca': verified('Sous-total'), de: verified('Zwischensumme'), ja: verified('小計') },
  },
  // account
  {
    key: 'account.signIn',
    en: 'Sign in',
    translations: { 'fr-ca': verified('Se connecter'), de: verified('Anmelden'), ja: verified('ログイン') },
  },
  {
    key: 'account.email',
    en: 'Email address',
    translations: {
      'fr-ca': verified('Adresse courriel'),
      de: verified('E-Mail-Adresse'),
      ja: verified('メールアドレス'),
    },
  },
  {
    key: 'account.password',
    en: 'Password',
    translations: { 'fr-ca': verified('Mot de passe'), de: verified('Passwort'), ja: verified('パスワード') },
  },
  {
    key: 'account.forgotPassword',
    en: 'Forgot your password?',
    translations: {
      'fr-ca': translated('Mot de passe oublié ?'),
      de: translated('Passwort vergessen?'),
      ja: translated('パスワードをお忘れですか？'),
    },
  },
  // errors
  {
    key: 'errors.required',
    en: 'This field is required',
    translations: {
      'fr-ca': verified('Ce champ est obligatoire'),
      de: verified('Dieses Feld ist erforderlich'),
      ja: verified('この項目は必須です'),
    },
  },
  {
    key: 'errors.card.declined',
    en: 'Your card was declined. Please try another payment method.',
    translations: {
      'fr-ca': verified('Votre carte a été refusée. Veuillez essayer un autre mode de paiement.'),
      de: verified('Ihre Karte wurde abgelehnt. Bitte versuchen Sie es mit einer anderen Zahlungsart.'),
      ja: verified('カードが承認されませんでした。別のお支払い方法をお試しください。'),
    },
  },
  {
    key: 'errors.network',
    en: 'Something went wrong. Please try again.',
    translations: {
      'fr-ca': translated('Une erreur s’est produite. Veuillez réessayer.'),
      de: translated('Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.'),
      ja: translated('問題が発生しました。もう一度お試しください。'),
    },
  },
];

/** Base-value edits applied after seeding: the checksum rule turns every existing translation of these keys stale. */
export const staleEdits: readonly Pick<UpdateResourceDto, 'key' | 'baseValue'>[] = [
  { key: 'checkout.shipping.freeThreshold', baseValue: 'Free standard shipping on orders over {amount}' },
  { key: 'checkout.shipping.estimate', baseValue: 'Estimated delivery by {date}' },
];

export function toCreateDto(entry: DemoEntry): CreateResourceDto {
  return {
    key: entry.key,
    baseValue: entry.en,
    comment: entry.comment,
    translations: Object.entries(entry.translations).map(([locale, [value, status]]) => ({ locale, value, status })),
  };
}
