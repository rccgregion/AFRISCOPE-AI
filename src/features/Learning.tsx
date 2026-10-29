import { useState } from 'react';
import {
  GraduationCap,
  ArrowRight,
  Clock,
  CheckCircle2,
  Download,
  Plus,
  Pencil,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, download } from '../lib/api';
import { PageHeader, Button, Status, Badge, Notice, Modal, KeyValue } from '../components/ui';
import { RecordForm } from '../components/workflow';
export function Learning() {
  const { data, allow } = useStore();
  const [selected, setSelected] = useState<Row | null>(null),
    [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const modules = data?.learning_modules || [],
    completed =
      data?.learning_progress.filter((p) => p.status === 'Completed' && p.user_id === data.user?.id)
        .length || 0;
  return (
    <>
      <PageHeader
        eyebrow="AI LEARNING ACADEMY"
        title="Build capability, not just confidence."
        description="Practical learning for people making evidence-informed decisions in development programmes."
        action-label="Learning administration"
      >
        <Button
          variant="secondary"
          onClick={() =>
            download(
              'afriscope-facilitator-playbook.md',
              '# AfriScope training playbook\n\n90-minute workshop\n\n1. Decision framing (15 min)\n2. Data quality exercise (20 min)\n3. Forecast evaluation (20 min)\n4. Human review simulation (20 min)\n5. Reflection and assessment (15 min)\n\nUse only synthetic data. Ask learners to identify assumptions and unsupported claims. Completion is not formal accreditation.\n\n' +
                modules.map((m) => '## ' + m.title + '\n' + m.content.facilitator).join('\n\n'),
              'text/markdown',
            )
          }
        >
          <Download size={16} />
          Facilitator playbook
        </Button>
        {allow('admin') && (
          <Button onClick={() => setEdit(null)}>
            <Plus size={16} />
            Manage lessons
          </Button>
        )}
      </PageHeader>
      <div className="learning-banner">
        <div>
          <span className="eyebrow">YOUR LEARNING WORKSPACE</span>
          <h2>Responsible use starts with understanding.</h2>
          <p>Eight practical pathways. Short lessons. Real application exercises.</p>
        </div>
        <div className="learning-progress-summary">
          <GraduationCap size={30} />
          <strong>
            {completed} / {modules.length}
          </strong>
          <span>lessons completed</span>
          <div className="budget-meter">
            <span
              style={{ width: modules.length ? (completed / modules.length) * 100 + '%' : '0%' }}
            />
          </div>
        </div>
      </div>
      <div className="learning-grid">
        {modules
          .sort((a, b) => a.position - b.position)
          .map((m, i) => {
            const p = data?.learning_progress.find(
              (p) => p.module_id === m.id && p.user_id === data.user?.id,
            );
            return (
              <button className="lesson-card" key={m.id} onClick={() => setSelected(m)}>
                <div className="lesson-card-top">
                  <span className="lesson-number">{String(i + 1).padStart(2, '0')}</span>
                  {p?.status === 'Completed' ? (
                    <Badge tone="green">Completed</Badge>
                  ) : (
                    <Badge>{p?.status || 'Not started'}</Badge>
                  )}
                </div>
                <span className="eyebrow">{m.pathway}</span>
                <h2>{m.title}</h2>
                <p>{m.description}</p>
                <footer>
                  <span>
                    <Clock size={14} />
                    {m.duration_minutes} min
                  </span>
                  <span>
                    {p?.status === 'Completed' ? 'Review lesson' : 'Open lesson'}
                    <ArrowRight size={15} />
                  </span>
                </footer>
              </button>
            );
          })}
      </div>
      <Notice>
        Lesson completion records support internal learning. They do not imply formal accreditation
        or professional certification.
      </Notice>
      {selected && (
        <Lesson
          record={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEdit(selected);
            setSelected(null);
          }}
        />
      )}
      {edit !== undefined && (
        <RecordForm
          title="Manage lesson content"
          table="learning_modules"
          initial={edit || undefined}
          fields={[
            { name: 'pathway', label: 'Learning pathway', required: true },
            { name: 'title', label: 'Lesson title', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            {
              name: 'duration_minutes',
              label: 'Duration (minutes)',
              type: 'number',
              required: true,
            },
            { name: 'position', label: 'Catalogue position', type: 'number', required: true },
            { name: 'published', label: 'Published', type: 'checkbox' },
            { name: 'content', label: 'Lesson content, quiz and rubric (JSON)', type: 'json' },
          ]}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
function Lesson({
  record,
  onClose,
  onEdit,
}: {
  record: Row;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { allow, data } = useStore(),
    action = useAction();
  const [answers, setAnswers] = useState<Record<number, number>>({}),
    [result, setResult] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const c = record.content;
  return (
    <Modal title={record.title} wide onClose={onClose}>
      <div className="lesson-reader">
        <div className="detail-top">
          <Badge tone="green">{record.duration_minutes} minute lesson</Badge>
          {allow('admin') && (
            <Button variant="secondary" onClick={onEdit}>
              <Pencil size={14} />
              Edit content
            </Button>
          )}
        </div>
        <h3>Learning objectives</h3>
        <ul className="detail-list">
          {c.objectives?.map((x: string) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {c.sections?.map((s: Row) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </section>
        ))}
        <section className="exercise-box">
          <span className="eyebrow">PRACTICAL APPLICATION</span>
          <h3>Check your understanding</h3>
          <p>Choose one answer per question. A score of 80% or higher records completion.</p>
          {c.quiz?.map((q: Row, i: number) => (
            <fieldset key={q.question}>
              <legend>
                {i + 1}. {q.question}
              </legend>
              {q.options.map((o: string, j: number) => (
                <label key={o} className={`quiz-option ${answers[i] === j ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={'question-' + i}
                    checked={answers[i] === j}
                    onChange={() => setAnswers({ ...answers, [i]: j })}
                  />
                  {o}
                </label>
              ))}
            </fieldset>
          ))}
          {!result && (
            <Button
              busy={busy}
              disabled={Object.keys(answers).length !== c.quiz?.length}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<Row>('/learning/' + record.id + '/submit', {
                    body: { answers },
                  });
                  setResult(r);
                  await action(async () => {}, 'Assessment result saved');
                } catch (e) {
                  action(async () => {
                    throw e;
                  });
                }
                setBusy(false);
              }}
            >
              <CheckCircle2 size={16} />
              Submit assessment
            </Button>
          )}
          {result && (
            <div className="assessment-result">
              <Status value={result.status} />
              <h3>{result.score}%</h3>
              {c.quiz?.map((q: Row, i: number) => (
                <div key={q.question}>
                  <strong>
                    {answers[i] === q.answer ? 'Correct' : 'Review needed'} · Question {i + 1}
                  </strong>
                  <p>{q.explanation}</p>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setAnswers({});
                }}
              >
                Try again
              </Button>
            </div>
          )}
        </section>
        <h3>Practical exercise marking rubric</h3>
        <KeyValue
          data={Object.fromEntries(
            (c.rubric || []).map((r: Row) => [r.criterion, r.marks + ' marks']),
          )}
        />
        <details className="facilitator-notes">
          <summary>Facilitator notes</summary>
          <p>{c.facilitator}</p>
        </details>
        <Notice>
          This is an internal learning record, not an accredited credential.
          {data?.learning_progress.some((p) => p.module_id === record.id)
            ? ' Your previous progress remains visible in the catalogue.'
            : ''}
        </Notice>
      </div>
    </Modal>
  );
}
