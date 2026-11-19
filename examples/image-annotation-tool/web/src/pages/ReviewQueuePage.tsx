import { useEffect, useState } from "react";

import { Task, getReviewQueue, reviewTask } from "../api/client";
import { BoundingBoxCanvas } from "../components/BoundingBoxCanvas";

/** Reviewer view: submitted tasks on the left, the selected one with approve/reject on the right. */
export function ReviewQueuePage() {
  const [queue, setQueue] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [comment, setComment] = useState("");

  async function refresh() {
    const tasks = await getReviewQueue();
    setQueue(tasks);
    setSelected(tasks[0] ?? null);
    setComment("");
  }

  useEffect(() => {
    refresh();
  }, []);

  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    await reviewTask(selected.id, decision, comment);
    await refresh();
  }

  return (
    <main>
      <h1>Review queue ({queue.length})</h1>
      <ul>
        {queue.map((task) => (
          <li key={task.id} onClick={() => setSelected(task)}>
            {task.image.thumbnail_url && <img src={task.image.thumbnail_url} alt="" width={64} />}
            #{task.id} {task.image.filename} ({task.annotations.length} boxes)
          </li>
        ))}
      </ul>

      {selected && (
        <section>
          <BoundingBoxCanvas imageUrl={selected.image.url} boxes={selected.annotations} />
          <textarea
            placeholder="Comment (required when rejecting)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button onClick={() => decide("approved")}>Approve</button>
          <button onClick={() => decide("rejected")} disabled={comment.trim() === ""}>
            Reject
          </button>
        </section>
      )}
    </main>
  );
}
