export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-100 via-sky-50 to-orange-100 px-4 text-center">
      <h1 className="text-xl font-semibold text-slate-800">You're offline</h1>
      <p className="text-sm text-slate-500">Reconnect to sync your projects and messages.</p>
    </div>
  );
}
