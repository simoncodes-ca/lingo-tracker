import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeleteResourceDialog, DeleteResourceDialogData, DeleteResourceDialogResult } from './delete-resource-dialog';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

describe('DeleteResourceDialog', () => {
  let component: DeleteResourceDialog;
  let fixture: ComponentFixture<DeleteResourceDialog>;
  let mockDialogRef: Partial<MatDialogRef<DeleteResourceDialog, DeleteResourceDialogResult>>;

  const sampleResource: ResourceSummaryDto = {
    key: 'app.title',
    translations: { en: 'Title' },
    status: {},
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DeleteResourceDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { resource: sampleResource, collectionName: 'test' } as DeleteResourceDialogData },
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteResourceDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should ingest dialog data', () => {
    expect(component.data.resource.key).toBe('app.title');
    expect(component.data.collectionName).toBe('test');
  });

  it('should close with false on cancel', () => {
    component.cancel();
    expect((mockDialogRef.close as any)).toHaveBeenCalledWith({ confirmed: false });
  });

  it('should close with true on confirm', () => {
    component.confirm();
    expect((mockDialogRef.close as any)).toHaveBeenCalledWith({ confirmed: true });
  });
});
