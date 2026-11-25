import { supabase } from './supabase-client.js';

export const auth = {
  async signUp(email, password, username, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName || username }
      }
    });
    if (error) throw error;
    return data;
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async currentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    return data.user;
  }
};

export async function getMyProfile() {
  const user = await auth.currentUser();
  if (!user) throw new Error('Please sign in first.');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

export async function getPublicProfile(userId) {
  const { data, error } = await supabase.from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(changes) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Please sign in first.');
  const allowed = {};
  for (const key of ['display_name', 'bio', 'avatar_url']) {
    if (changes[key] !== undefined) allowed[key] = changes[key];
  }
  const { data, error } = await supabase.from('profiles')
    .update(allowed).eq('id', user.id).select().single();
  if (error) throw error;
  return data;
}

export async function listStreams({ category, search } = {}) {
  let query = supabase.from('streams')
    .select('*, profiles!streams_creator_id_fkey(id, username, display_name, avatar_url)')
    .eq('status', 'live').order('created_at', { ascending: false });
  if (category && category !== 'All') query = query.eq('category', category);
  if (search) query = query.ilike('title', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createStream({ title, description = '', category = 'General', thumbnail_url = null }) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in before creating a stream.');
  const { data, error } = await supabase.from('streams').insert({
    creator_id: user.id,
    title: title.trim(),
    description,
    category,
    thumbnail_url,
    status: 'live',
    started_at: new Date().toISOString()
  }).select().single();
  if (error) throw error;
  return data;
}

export async function endStream(streamId) {
  const { data, error } = await supabase.from('streams').update({
    status: 'ended',
    ended_at: new Date().toISOString()
  }).eq('id', streamId).select().single();
  if (error) throw error;
  return data;
}

export async function getMyFollowing() {
  const user = await auth.currentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('follows')
    .select('followed_id, profiles!follows_followed_id_fkey(id, username, display_name, avatar_url)')
    .eq('follower_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function isFollowing(creatorId) {
  const user = await auth.currentUser();
  if (!user) return false;
  const { data, error } = await supabase.from('follows').select('followed_id')
    .eq('follower_id', user.id).eq('followed_id', creatorId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function followCreator(creatorId) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in to follow creators.');
  const { error } = await supabase.from('follows').insert({
    follower_id: user.id,
    followed_id: creatorId
  });
  if (error && error.code !== '23505') throw error;
}

export async function unfollowCreator(creatorId) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.from('follows').delete()
    .eq('follower_id', user.id).eq('followed_id', creatorId);
  if (error) throw error;
}

export async function getStreamLikeStats(streamId) {
  const user = await auth.currentUser();
  const [{ count, error: countError }, { data: ownLike, error: ownError }] = await Promise.all([
    supabase.from('stream_likes').select('*', { count: 'exact', head: true }).eq('stream_id', streamId),
    user
      ? supabase.from('stream_likes').select('stream_id').eq('stream_id', streamId).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (countError) throw countError;
  if (ownError) throw ownError;
  return { count: count || 0, liked: Boolean(ownLike) };
}

export async function likeStream(streamId) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in to like streams.');
  const { error } = await supabase.from('stream_likes').insert({
    stream_id: streamId,
    user_id: user.id
  });
  if (error && error.code !== '23505') throw error;
}

export async function sendChatMessage(streamId, message) {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in to send chat messages.');
  const { data, error } = await supabase.from('stream_messages')
    .insert({ stream_id: streamId, user_id: user.id, message: message.trim() })
    .select('*, profiles!stream_messages_user_id_fkey(username, display_name)').single();
  if (error) throw error;
  return data;
}

export async function getChatMessages(streamId) {
  const { data, error } = await supabase.from('stream_messages')
    .select('*, profiles!stream_messages_user_id_fkey(username, display_name)')
    .eq('stream_id', streamId).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  return data || [];
}

export function subscribeToChat(streamId, onMessage) {
  return supabase.channel(`streamx-chat-${streamId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_messages',
      filter: `stream_id=eq.${streamId}`
    }, payload => onMessage(payload.new))
    .subscribe();
}

export function subscribeToStreams(onChange) {
  return supabase.channel('streamx-live-streams')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'streams'
    }, payload => onChange(payload))
    .subscribe();
}

export async function getMyNotifications() {
  const user = await auth.currentUser();
  if (!user) throw new Error('Sign in first.');
  const { data, error } = await supabase.from('notifications').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
}

export { supabase };
