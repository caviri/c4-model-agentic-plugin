import { FormEvent, useEffect, useState } from "react";

import { ExportJob, getExport, requestExport, uploadBatch } from "../api/client";

const POLL_INTERVAL_MS = 2000;

/** Admin view: upload a batch of images, and export approved annotations as COCO JSON. */
export function AdminUploadPage() {
  const [batchName, setBatchName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);

  async function upload(event: FormEvent) {
    event.preventDefault();
    const result = await uploadBatch(batchName, files);
    setUploaded(result.image_ids.length);
  }

  // The export is built by the worker, so poll until it is done.
  useEffect(() => {
    if (!exportJob || exportJob.status === "done" || exportJob.status === "failed") return;
    const timer = setTimeout(async () => setExportJob(await getExport(exportJob.id)), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [exportJob]);

  return (
    <main>
      <h1>Upload image batch</h1>
      <form onSubmit={upload}>
        <input placeholder="Batch name" value={batchName} onChange={(e) => setBatchName(e.target.value)} required />
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button type="submit" disabled={files.length === 0}>
          Upload
        </button>
      </form>
      {uploaded !== null && <p>{uploaded} images uploaded. One annotation task was created for each.</p>}

      <h1>Export</h1>
      <button onClick={async () => setExportJob(await requestExport())}>Export approved annotations (COCO)</button>
      {exportJob && <p>Export #{exportJob.id}: {exportJob.status}</p>}
      {exportJob?.download_url && (
        <a href={exportJob.download_url} download>
          Download COCO JSON ({exportJob.task_count} images)
        </a>
      )}
    </main>
  );
}
