import { type EditResourceChanges, editResource } from '@simoncodes-ca/core';
import { entryChange } from '@simoncodes-ca/domain';
import { defineCommand } from '../runner/command-runner';
import { flagName } from '../runner/flag-record';
import { ConsoleFormatter, reportRun, printTerminologyFindings } from '../utils';
import { EDIT_RESOURCE_FLAGS } from './edit-resource-flags';

export interface EditResourceOptions {
  collection?: string;
  key?: string;
  targetFolder?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locale?: string;
  localeValue?: string;
}

export const editResourceCommand = defineCommand<EditResourceOptions>()({
  flags: EDIT_RESOURCE_FLAGS,
  name: 'Edit resource',
  collection: 'writable',

  required: ['key'],
  run: async ({ collection, answers }) => {
    const translations =
      answers.locale && answers.localeValue ? { [answers.locale]: { value: answers.localeValue } } : undefined;
    if (!translations && (answers.locale || answers.localeValue)) {
      ConsoleFormatter.warning(
        `Both ${flagName(EDIT_RESOURCE_FLAGS.locale)} and ${flagName(EDIT_RESOURCE_FLAGS.localeValue)} must be provided to update a translation.`,
      );
    }

    const changes: EditResourceChanges = {
      baseValue: answers.baseValue || undefined,
      ...entryChange('edit', answers),
      translations,
      // `--target-folder` names the folder the entry moves to ('' for the collection root).
      moveTo: answers.targetFolder,
    };

    const result = await editResource(collection, answers.key, changes);

    if (result.updated) {
      ConsoleFormatter.success(`Resource "${result.resolvedKey}" updated successfully.`);
      // Present only when this invocation supplied a base value (core's rule): editing a
      // comment or a translation does not re-raise advice about untouched wording.
      if (result.terminology) {
        printTerminologyFindings(result.terminology);
      }
    } else {
      ConsoleFormatter.info(result.message || 'No changes detected');
    }
    return reportRun({ warnings: result.warnings ?? [], errors: [], outcome: 'succeeded' });
  },
});
