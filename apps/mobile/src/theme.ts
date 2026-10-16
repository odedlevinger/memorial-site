import { Platform } from 'react-native';

export const colors = {
  paper: '#f6f4f0',
  ink: '#1b1b1b',
  muted: '#6d6a64',
  rule: '#d9d5cd',
  night: '#0c0c0c',
} as const;

export const serif: string = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
