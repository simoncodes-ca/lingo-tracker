import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'truncateKey',
  standalone: true,
})
export class TruncateKeyPipe implements PipeTransform {
  readonly #maximumLength = 50;

  transform(key: string): string {
    if (!key || key.length < this.#maximumLength) {
      return key;
    }

    const segments = key.split('.');

    if (segments.length === 1) {
      return key;
    }

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const basicTruncation = `${firstSegment}...${lastSegment}`;

    if (basicTruncation.length >= this.#maximumLength) {
      return basicTruncation;
    }

    if (segments.length >= 3) {
      const secondToLastSegment = segments[segments.length - 2];
      const extendedTruncation = `${firstSegment}...${secondToLastSegment}.${lastSegment}`;

      if (extendedTruncation.length < this.#maximumLength) {
        return extendedTruncation;
      }
    }

    return basicTruncation;
  }
}
