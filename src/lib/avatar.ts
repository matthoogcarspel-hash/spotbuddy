import { supabase } from './supabase';

export async function uploadAvatar(userId: string, localUri: string) {
  const filePath = `${userId}/avatar.jpg`;
  console.log('avatar upload path', filePath);

  const imageResponse = await fetch(localUri);
  const imageBlob = await imageResponse.blob();

  const uploadResult = await supabase.storage.from('avatars').upload(filePath, imageBlob, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  console.log('avatar upload result', uploadResult);

  if (uploadResult.error) {
    return { error: uploadResult.error, publicUrl: null as string | null };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = data.publicUrl;
  console.log('avatar public url', publicUrl);

  if (!publicUrl) {
    return { error: new Error('Avatar URL ontbreekt'), publicUrl: null as string | null };
  }

  return { error: null, publicUrl };
}
