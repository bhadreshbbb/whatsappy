import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, FolderPlus, Trash2, Upload, ImageIcon,
  Copy, Check, X, ChevronLeft, Loader2, AlertCircle
} from 'lucide-react';

const API = (path) => `/api/gallery${path}`;
const CHANNEL = () => localStorage.getItem('channelId') || 'demo';
const headers = () => ({ 'x-channel-id': CHANNEL() });

async function apiFetch(path, opts = {}) {
  const res = await fetch(API(path), {
    headers: { ...headers(), ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Gallery() {
  const [folders, setFolders]           = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [error, setError]               = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [copiedId, setCopiedId]         = useState(null);
  const [dragOver, setDragOver]         = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadFolders(); }, []);

  async function loadFolders() {
    setLoading(true);
    try {
      const data = await apiFetch('/folders');
      setFolders(data.folders);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadImages(folder) {
    setActiveFolder(folder);
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/folders/${folder.id}/images`);
      setImages(data.images);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setError('');
    try {
      await apiFetch('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      setNewFolderName('');
      setShowNewFolder(false);
      loadFolders();
    } catch (e) { setError(e.message); }
  }

  async function deleteFolder(e, folder) {
    e.stopPropagation();
    if (!confirm(`Delete folder "${folder.name}" and all its images?`)) return;
    try {
      await apiFetch(`/folders/${folder.id}`, { method: 'DELETE' });
      if (activeFolder?.id === folder.id) { setActiveFolder(null); setImages([]); }
      loadFolders();
    } catch (e) { setError(e.message); }
  }

  async function uploadFiles(files) {
    if (!activeFolder || !files.length) return;
    setUploading(true);
    setError('');
    let uploaded = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(API(`/folders/${activeFolder.id}/upload`), {
          method: 'POST', headers: headers(), body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        uploaded++;
      } catch (e) {
        setError(`Failed to upload ${file.name}: ${e.message}`);
      }
    }
    if (uploaded > 0) { loadImages(activeFolder); loadFolders(); }
    setUploading(false);
  }

  async function deleteImage(img) {
    if (!confirm(`Delete "${img.filename}"?`)) return;
    try {
      await apiFetch(`/images/${img.id}`, { method: 'DELETE' });
      setImages(prev => prev.filter(i => i.id !== img.id));
      loadFolders();
    } catch (e) { setError(e.message); }
  }

  function copyMediaId(id) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="flex gap-5 h-full">

      {/* ── Folders sidebar ── */}
      <div className="w-60 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">My Gallery</h2>
          <button onClick={() => setShowNewFolder(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
            style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)", color: "#4ade80" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(37,211,102,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(37,211,102,0.12)"}>
            <FolderPlus size={12} /> New
          </button>
        </div>

        {showNewFolder && (
          <div className="flex gap-2">
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFolder()}
              placeholder="Folder name…"
              className="input flex-1 text-xs py-1.5" />
            <button onClick={createFolder}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)", color: "#4ade80" }}>
              Add
            </button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
              className="p-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", color: "#64748b" }}>
              <X size={13} />
            </button>
          </div>
        )}

        {loading && !activeFolder && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "#64748b" }}>
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        )}

        <div className="flex flex-col gap-1">
          {folders.length === 0 && !loading && (
            <div className="text-center py-8">
              <FolderOpen size={28} className="mx-auto mb-2" style={{ color: "#1e293b" }} />
              <p className="text-xs" style={{ color: "#475569" }}>No folders yet.<br />Create one to start.</p>
            </div>
          )}
          {folders.map(f => {
            const isActive = activeFolder?.id === f.id;
            return (
              <div key={f.id} onClick={() => loadImages(f)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer group transition-all"
                style={isActive
                  ? { background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)" }
                  : { background: "transparent", border: "1px solid transparent" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={14} style={{ color: isActive ? "#4ade80" : "#64748b", flexShrink: 0 }} />
                  <span className="text-xs truncate" style={{ color: isActive ? "#fff" : "#94a3b8" }}>{f.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs" style={{ color: "#475569" }}>{f.imageCount}</span>
                  <button onClick={e => deleteFolder(e, f)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#ef4444" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Images panel ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {!activeFolder ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "#334155" }}>
            <FolderOpen size={52} style={{ opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "#475569" }}>Select a folder to view images</p>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => { setActiveFolder(null); setImages([]); }}
                  className="transition-colors" style={{ color: "#475569" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
                  onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
                  <ChevronLeft size={18} />
                </button>
                <h3 className="text-white font-semibold text-sm">{activeFolder.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                  {images.length} images
                </span>
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="btn-primary gap-2">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'Uploading to Meta…' : 'Upload Images'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/mp4" multiple hidden
                onChange={e => uploadFiles([...e.target.files])} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                <AlertCircle size={13} />
                {error}
                <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
              </div>
            )}

            {/* Drop zone */}
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl p-6 text-center cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragOver ? "rgba(37,211,102,0.5)" : "rgba(255,255,255,0.07)"}`,
                background: dragOver ? "rgba(37,211,102,0.05)" : "transparent",
              }}>
              <Upload size={20} className="mx-auto mb-2" style={{ color: dragOver ? "#4ade80" : "#475569" }} />
              <p className="text-xs" style={{ color: "#475569" }}>
                Drag & drop images here or click Upload<br />
                JPG, PNG, WEBP, MP4 — max 16 MB
              </p>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#64748b" }}>
                <Loader2 size={16} className="animate-spin" /> Loading images…
              </div>
            ) : images.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <ImageIcon size={40} style={{ color: "#1e293b" }} />
                <p className="text-sm" style={{ color: "#475569" }}>No images yet. Upload your first image.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {images.map(img => (
                  <div key={img.id} className="group relative rounded-2xl overflow-hidden transition-all"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                    onMouseEnter={e => { e.currentTarget.style.border = "1px solid rgba(37,211,102,0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)"; e.currentTarget.style.transform = "translateY(0)"; }}>

                    {/* Preview */}
                    <div className="aspect-square overflow-hidden"
                      style={{ background: "linear-gradient(135deg, rgba(37,211,102,0.08), rgba(8,13,23,0.9))" }}>
                      <img src={`/api/gallery/images/${img.id}/preview`} alt={img.filename}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                      <div className="w-full h-full items-center justify-center hidden">
                        <ImageIcon size={28} style={{ color: "#334155" }} />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="text-white text-xs font-medium truncate" title={img.filename}>{img.filename}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#475569" }}>{formatSize(img.size)}</p>
                      <div className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1.5"
                        style={{ background: "rgba(0,0,0,0.3)" }}>
                        <span className="text-xs font-mono flex-1 truncate" style={{ color: "#4ade80" }}
                          title={img.media_id}>{img.media_id.slice(0, 14)}…</span>
                        <button onClick={() => copyMediaId(img.media_id)}
                          className="shrink-0 transition-colors"
                          style={{ color: "#64748b" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#4ade80"}
                          onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
                          title="Copy Media ID">
                          {copiedId === img.media_id ? <Check size={12} style={{ color: "#4ade80" }} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>

                    {/* Delete btn */}
                    <button onClick={() => deleteImage(img)}
                      className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
