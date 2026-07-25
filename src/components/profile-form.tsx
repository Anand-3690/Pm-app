'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Camera } from 'lucide-react';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initials = (fullName || profile.email || '?')[0].toUpperCase();

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const filePath = `${profile.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    setAvatarUrl(urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), avatar_url: avatarUrl || null })
      .eq('id', profile.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    router.refresh();
  };

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-[12px] border border-line bg-surface p-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink font-display text-xl font-bold text-white">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-signal text-white transition-colors hover:bg-signal-hover"
          >
            <Camera size={12} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarSelect}
            className="hidden"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{profile.email}</p>
          <p className="text-xs text-ink-4">
            {uploading ? 'Uploading photo…' : 'Tap the camera icon to change photo'}
          </p>
        </div>
      </div>

      <div>
        <label className="rule-label mb-1 block text-ink-2">Full name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-line bg-ground px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-signal focus:ring-2 focus:ring-signal/25"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-signal-ink">Profile updated.</p>}

      <button
        disabled={saving || uploading}
        className="w-full rounded-lg bg-signal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}