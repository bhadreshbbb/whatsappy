import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, FolderPlus, Trash2, Upload, Image,
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

export default function Gallery() {
  const [folders, setFolders]         = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [copiedId, setCopiedId]       = useState(null);
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
          method: 'POST',
          headers: headers(),
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        uploaded++;
      } catch (e) {
        setError(`Failed to upload ${file.name}: ${e.message}`);
      }
    }
    if (uploaded > 0) {
      loadImages(activeFolder);
      loadFolders();
    }
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
    uploadFiles([...e.dataTransfer.files]);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="flex gap-6 h-full">

      {/* ── Left: Folders panel ─────────────────────────── */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">My Gallery</h2>
          <button
            onClick={() => setShowNewFolder(v => !v)}
            className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded-lg"
          >
            <FolderPlus size={13} /> New Folder
          </button>
        </div>

        {showNewFolder && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFolder()}
              placeholder="Folder name..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-green-500"
            />
            <button onClick={createFolder} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs">Add</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="bg-white/5 hover:bg-white/10 text-slate-400 px-2 py-1.5 rounded-lg">
              <X size={13} />
            </button>
          </div>
        )}

        {loading && !activeFolder && (
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading...
          </div>
        )}

        <div className="flex flex-col gap-1">
          {folders.length === 0 && !loading && (
            <p className="text-slate-500 text-xs text-center py-6">No folders yet.<br />Create one to start uploading.</p>
          )}
          {folders.map(f => (
            <div
              key={f.id}
              onClick={() => loadImages(f)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer group transition-all ${
                activeFolder?.id === f.id
                  ? 'bg-green-600/20 border border-green-600/40 text-white'
                  : 'hover:bg-white/5 border border-transparent text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen size={15} className={activeFolder?.id === f.id ? 'text-green-400' : 'text-slate-400'} />
                <span className="text-xs truncate">{f.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-500">{f.imageCount}</span>
                <button
                  onClick={(e) => deleteFolder(e, f)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: Images panel ─────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {!activeFolder ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
            <FolderOpen size={48} className="opacity-30" />
            <p className="text-sm">Select a folder to view images</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => { setActiveFolder(null); setImages([]); }} className="text-slate-400 hover:text-white">
                  <ChevronLeft size={18} />
                </button>
                <h3 className="text-white font-semibold">{activeFolder.name}</h3>
                <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{images.length} images</span>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-xl"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading to Meta...' : 'Upload Images'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/mp4" multiple hidden onChange={e => uploadFiles([...e.target.files])} />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl">
                <AlertCircle size={14} />
                {error}
                <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/10 hover:border-green-600/40 rounded-2xl p-6 text-center cursor-pointer transition-colors"
            >
              <Upload size={20} className="mx-auto text-slate-500 mb-2" />
              <p className="text-slate-500 text-xs">Drag & drop images here or click Upload<br />JPG, PNG, WEBP, MP4 — max 16MB</p>
            </div>

            {/* Images grid */}
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading images...
              </div>
            ) : images.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Image size={40} className="opacity-30" />
                <p className="text-sm">No images yet. Upload your first image.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {images.map(img => (
                  <div key={img.id} className="group relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-green-600/40 transition-all">
                    {/* Image preview */}
                    <div className="aspect-square bg-gradient-to-br from-green-900/20 to-slate-800 overflow-hidden">
                      <img
                        src={`/api/gallery/images/${img.id}/preview`}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div className="w-full h-full items-center justify-center hidden">
                        <Image size={28} className="text-slate-600" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="text-white text-xs font-medium truncate" title={img.filename}>{img.filename}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{formatSize(img.size)}</p>

                      {/* Media ID */}
                      <div className="mt-2 flex items-center gap-1 bg-black/30 rounded-lg px-2 py-1.5">
                        <span className="text-green-400 text-xs font-mono truncate flex-1" title={img.media_id}>
                          {img.media_id.slice(0, 14)}...
                        </span>
                        <button
                          onClick={() => copyMediaId(img.media_id)}
                          className="text-slate-400 hover:text-green-400 shrink-0"
                          title="Copy Media ID"
                        >
                          {copiedId === img.media_id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteImage(img)}
                      className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
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
