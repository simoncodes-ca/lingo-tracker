import { NotFoundException } from '@nestjs/common';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { JobNotFoundError } from './job-not-found.error';

describe('JobNotFoundError HTTP mapping', () => {
  it.each(['Bundle', 'Translation'])('preserves the old %s job 404 body exactly', (jobName) => {
    const message = `${jobName} job "missing" not found`;
    const previous = new NotFoundException(message);
    const mapped = toHttpException(new JobNotFoundError('missing', jobName));
    expect(mapped.getStatus()).toBe(404);
    expect(mapped.getResponse()).toEqual({ statusCode: 404, message, error: 'Not Found' });
    expect(JSON.stringify(mapped.getResponse())).toBe(JSON.stringify(previous.getResponse()));
  });
});
