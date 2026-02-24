"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";

interface FileItem {
  id: string;
  name: string;
  createdTime: string;
}

export default function MediaFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const searchParams = useSearchParams();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const folderName = searchParams.get("name") || "Photos";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setFolderId(p.folderId));
  }, [params]);

  useEffect(() => {
    if (!folderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ncsn-photos/files?folderId=${encodeURIComponent(folderId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setFiles([]);
          return;
        }
        setFiles(data.files ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load photos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  if (!folderId) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 pb-16">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/media"
          className="flex items-center gap-1 text-gray-400 hover:text-primary text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Media
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <p className="text-center text-gray-400 py-8">{error}</p>
      )}

      {!loading && !error && files.length > 0 && (
        <>
          <h2 className="gold-wave text-2xl font-bold mb-6">
            {folderName}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {files.map((file) => (
              <a
                key={file.id}
                href={`/api/media/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 hover:border-primary/50 transition-colors group"
              >
                <div className="aspect-square bg-neutral-800 relative">
                  <img
                    src={`/api/media/${file.id}`}
                    alt={file.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
                <p className="p-2 text-xs text-gray-400 truncate" title={file.name}>
                  {file.name}
                </p>
              </a>
            ))}
          </div>
        </>
      )}

      {!loading && !error && files.length === 0 && (
        <p className="text-center text-gray-400 py-8">No photos in this folder.</p>
      )}
    </section>
  );
}
