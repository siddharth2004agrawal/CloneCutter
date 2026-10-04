import { useEffect, useState } from 'react';
import { getExt } from '../lib/files.js';
import Icon from './Icon.jsx';

export default function FilePreview({ file, serverBase }) {
  const [localUrl, setLocalUrl] = useState('');
  const ext = getExt(file.path);
  const kind = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext) ? 'image'
    : ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext) ? 'video'
      : ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext) ? 'audio' : 'document';

  useEffect(() => {
    let active = true;
    let url;
    setLocalUrl('');
    if (serverBase === undefined && kind !== 'document') {
      void (async () => {
        try {
          const blob = file.file || await file.handle?.getFile();
          if (!blob || !active) return;
          url = URL.createObjectURL(blob);
          setLocalUrl(url);
        } catch {
          // An inaccessible preview should not prevent choosing which copy to keep.
        }
      })();
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, kind, serverBase]);

  const src = serverBase === undefined ? localUrl : `${serverBase}/api/preview?path=${encodeURIComponent(file.path)}`;
  return (
    <div className={`file-thumb-slot${kind === 'audio' ? ' file-thumb-slot-audio' : ''}`}>
      {kind === 'image' && src ? <img className="file-thumb" loading="lazy" alt={`Preview of ${file.path}`} src={src} />
        : kind === 'video' && src ? <video className="file-thumb file-thumb-video" muted playsInline preload="metadata" src={src} aria-label={`Preview of ${file.path}`} />
          : kind === 'audio' && src ? <><div className="file-thumb-placeholder"><Icon name="music" size={22} /></div><audio className="file-audio-preview" controls preload="none" src={src} aria-label={`Preview of ${file.path}`} /></>
            : <div className="file-thumb-placeholder"><Icon name="file" size={23} /></div>}
    </div>
  );
}
