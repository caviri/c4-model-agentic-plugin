import { useEffect, useState } from "react";

import {
  Box,
  Task,
  claimNextTask,
  listMyRejectedTasks,
  reopenTask,
  saveAnnotations,
  submitTask,
} from "../api/client";
import { BoundingBoxCanvas } from "../components/BoundingBoxCanvas";

/** Annotator view: work on one task at a time, plus a list of rejected tasks to fix. */
export function AnnotatePage() {
  const [task, setTask] = useState<Task | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [label, setLabel] = useState("object");
  const [rejected, setRejected] = useState<Task[]>([]);

  function open(next: Task | null) {
    setTask(next);
    setBoxes(next?.annotations ?? []);
  }

  async function loadNext() {
    open(await claimNextTask());
    setRejected(await listMyRejectedTasks());
  }

  useEffect(() => {
    loadNext();
  }, []);

  async function submit() {
    if (!task) return;
    await saveAnnotations(task.id, boxes);
    await submitTask(task.id);
    await loadNext();
  }

  async function reopen(rejectedTask: Task) {
    if (task) await saveAnnotations(task.id, boxes);
    open(await reopenTask(rejectedTask.id));
    setRejected(await listMyRejectedTasks());
  }

  return (
    <main>
      <h1>Annotate</h1>

      {task ? (
        <section>
          <p>
            Task #{task.id} - {task.image.filename}
          </p>
          {task.last_review?.decision === "rejected" && (
            <p role="note">Reviewer comment: {task.last_review.comment}</p>
          )}
          <label>
            Label <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <BoundingBoxCanvas imageUrl={task.image.url} boxes={boxes} label={label} onChange={setBoxes} />
          <p>Drag to draw a box, double-click a box to remove it.</p>
          <button onClick={() => saveAnnotations(task.id, boxes)}>Save draft</button>
          <button onClick={submit} disabled={boxes.length === 0}>
            Submit for review
          </button>
        </section>
      ) : (
        <p>No pending tasks. Check back after the next upload.</p>
      )}

      <h2>Rejected ({rejected.length})</h2>
      <ul>
        {rejected.map((r) => (
          <li key={r.id}>
            #{r.id} {r.image.filename}: "{r.last_review?.comment}"{" "}
            <button onClick={() => reopen(r)}>Fix</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
