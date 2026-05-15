import { supabase } from './supabase';

export async function uploadAvatar(userId: string, localUri: string) {
  const filePath = `${userId}/avatar.jpg`;

  // arrayBuffer werkt betrouwbaar op zowel native als web
  const response = await fetch(localUri);
  if (!response.ok) {
    return { error: new Error('Failed to read image'), publicUrl: null as string | null };
  }

  const arrayBuffer = await response.arrayBuffer();

  const uploadResult = await supabase.storage.from('avatars').upload(filePath, arrayBuffer, {
    upsert: true,
    contentType: 'image/jpeg',
  });

  if (uploadResult.error) {
    return { error: uploadResult.error, publicUrl: null as string | null };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

  if (!data.publicUrl) {
    return { error: new Error('Avatar URL ontbreekt'), publicUrl: null as string | null };
  }

  // Cache-busting zodat de app de nieuwe foto toont
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  return { error: null, publicUrl };
}
