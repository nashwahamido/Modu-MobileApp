import { supabase } from './supabase';

export function getModelUrl(filename: string): string {
  const { data } = supabase.storage
    .from('models')
    .getPublicUrl(filename);
  return data.publicUrl;
}

// named constants for each model
export const MODELS = {
  LACK: getModelUrl('LACK_30449908_55x55.glb'),
};