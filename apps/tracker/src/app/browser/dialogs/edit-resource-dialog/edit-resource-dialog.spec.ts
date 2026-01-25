import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditResourceDialog, EditResourceDialogData } from './edit-resource-dialog';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

describe('EditResourceDialog', () => {
  let component: EditResourceDialog;
  let fixture: ComponentFixture<EditResourceDialog>;
  let mockDialogRef: Partial<MatDialogRef<EditResourceDialog>>;

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
      imports: [EditResourceDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { resource: sampleResource, collectionName: 'test' } as EditResourceDialogData },
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditResourceDialog);
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

  it('should close when cancel clicked', () => {
    component.close();
    expect((mockDialogRef.close as any)).toHaveBeenCalled();
  });
});
