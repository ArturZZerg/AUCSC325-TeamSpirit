import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { classImportMaxBytes, classImportPreviewSchema, type ClassImportPreview } from '@campusflow/contracts';
import { api } from '@/lib/api';

export type PickedCalendar = { name: string; text: string };

/** Lets the student choose a calendar file. Returns undefined when they cancel. */
export async function pickCalendarFile(): Promise<PickedCalendar | undefined> {
  // Android file managers label .ics files inconsistently, so native accepts any file and the API decides.
  const result = await DocumentPicker.getDocumentAsync({ type: Platform.OS === 'web' ? ['.ics', 'text/calendar'] : '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return undefined;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > classImportMaxBytes) throw new Error('Calendar files can be up to 1 MB. Export a shorter date range and try again.');
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  // Some pickers report no size, so check what was actually read.
  if (new TextEncoder().encode(text).length > classImportMaxBytes) throw new Error('Calendar files can be up to 1 MB. Export a shorter date range and try again.');
  return { name: asset.name, text };
}

/** Asks the API which weekly classes the file contains. Nothing is saved. */
export async function previewCalendar(text: string): Promise<ClassImportPreview> {
  if (!text.trim()) throw new Error('This file is empty. Choose your calendar export (.ics).');
  return classImportPreviewSchema.parse(await api('/classes/import-preview', { method: 'POST', body: text, headers: { 'Content-Type': 'text/calendar; charset=utf-8' } }));
}
