import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { gymImportResultSchema, type GymImportResult } from '@campusflow/contracts';
import { api } from '@/lib/api';

const maxBytes = 4 * 1024 * 1024;

/** Lets the student choose an openGym backup (.json). Returns undefined when they cancel. */
export async function pickOpenGymBackup(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: Platform.OS === 'web' ? ['.json', 'application/json'] : '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return undefined;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > maxBytes) throw new Error('Backups can be up to 4 MB.');
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error('Backups can be up to 4 MB.');
  return text;
}

/** Imports programs, exercises, workouts and body weight. Safe to repeat: nothing is duplicated (ADR 022). */
export async function importOpenGymBackup(text: string): Promise<GymImportResult> {
  if (!text.trim()) throw new Error('This file is empty. Choose the openGym backup file.');
  return gymImportResultSchema.parse(await api('/gym/import/opengym', { method: 'POST', body: text, headers: { 'Content-Type': 'application/octet-stream' } }));
}
