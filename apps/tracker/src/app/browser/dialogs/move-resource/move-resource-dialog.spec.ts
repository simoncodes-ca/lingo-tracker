import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MoveResourceDialog,
  MoveResourceDialogData,
} from './move-resource-dialog';
import { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

describe('MoveResourceDialog', () => {
  let component: MoveResourceDialog;
  let fixture: ComponentFixture<MoveResourceDialog>;
  let mockDialogRef: Partial<MatDialogRef<MoveResourceDialog>>;

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
      imports: [MoveResourceDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            resource: sampleResource,
            collectionName: 'test',
          } as MoveResourceDialogData,
        },
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MoveResourceDialog);
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
    expect(mockDialogRef.close as any).toHaveBeenCalled();
  });
});
