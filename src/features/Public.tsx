import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Database,
  FlaskConical,
  Workflow,
  CheckCircle2,
  LockKeyhole,
  BookOpen,
  Scale,
  Pill,
  Landmark,
  Layers3,
  Play,
  ChevronRight,
} from 'lucide-react';
import { Logo } from '../components/Shell';
import { Button, Notice, Badge } from '../components/ui';
import { api } from '../lib/api';
export function Landing() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const enter = async () => {
    setBusy(true);
    try {
      await api('/auth/demo', { body: { role: 'programme_manager' } });
      location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="public-page">
      <header className="public-header">
        <Logo />
        <nav>
          <a href="#solutions">Solutions</a>
          <a href="#platform">Platform</a>
          <a href="#responsibility">Responsible AI</a>
          <Link to="/guide">Documentation</Link>
        </nav>
        <div>
          <Link className="btn btn-ghost" to="/sign-in">
            Sign in
          </Link>
          <Button onClick={enter} busy={busy}>
            Explore demo <ArrowUpRight size={15} />
          </Button>
        </div>
      </header>
      <main>
        <section className="public-hero">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span />
              DECISION INTELLIGENCE FOR AFRICAN DEVELOPMENT
            </div>
            <h1>
              Clearer evidence.
              <br />
              Better decisions.
              <br />
              <span>Stronger systems.</span>
            </h1>
            <p>
              Connect the dots between development priorities, operational data, and practical
              action. AfriScope AI helps teams see what needs attention—and understand why.
            </p>
            <div className="hero-actions">
              <Button onClick={enter} busy={busy}>
                Explore the live workspace <ArrowRight size={17} />
              </Button>
              <a href="#platform" className="btn btn-secondary">
                <Play size={15} />
                See how it works
              </a>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="hero-principles">
              <span>
                <CheckCircle2 size={15} />
                Evidence-backed
              </span>
              <span>
                <CheckCircle2 size={15} />
                Human-led
              </span>
              <span>
                <CheckCircle2 size={15} />
                Transparent by design
              </span>
            </div>
          </div>
          <div className="hero-product">
            <div className="product-window">
              <div className="product-window-top">
                <Logo />
                <Badge tone="green">Synthetic demo</Badge>
              </div>
              <div className="preview-heading">
                <span className="eyebrow">MEDICINE AVAILABILITY INTELLIGENCE</span>
                <h2>
                  The right stock.
                  <br />
                  The right evidence.
                </h2>
                <p>Illustrative interface preview · fictional facilities</p>
              </div>
              <div className="preview-metrics">
                <div>
                  <span>Facilities</span>
                  <strong>12</strong>
                  <small>Fixed demonstration dataset</small>
                </div>
                <div>
                  <span>Inventory history</span>
                  <strong>
                    52 <em>weeks</em>
                  </strong>
                  <small>2,496 linked records</small>
                </div>
              </div>
              <div className="preview-table">
                <div className="preview-table-title">
                  <strong>Supply signals</strong>
                  <span>Method: usable stock / consumption</span>
                </div>
                {[
                  ['Mtoni Clinic', 'Amoxicillin 500 mg', 'Verify stock'],
                  ['Kijiji Clinic', 'Amoxicillin 500 mg', 'Review transfer'],
                  ['Nyota Clinic', 'Amoxicillin 500 mg', 'Check expiry'],
                ].map(([a, b, c]) => (
                  <div key={a}>
                    <span className="preview-facility">
                      <Pill size={15} />
                    </span>
                    <span>
                      <strong>{a}</strong>
                      <small>{b}</small>
                    </span>
                    <span className="preview-risk">
                      {c}
                      <ChevronRight size={12} />
                    </span>
                  </div>
                ))}
              </div>
              <div className="preview-footer">
                <ShieldCheck size={16} />
                Every signal links to its source evidence.
              </div>
            </div>
            <div className="hero-floating">
              <span>
                <Database size={21} />
              </span>
              <div>
                <strong>From fragmented records</strong>
                <p>to a traceable decision trail.</p>
              </div>
              <CheckCircle2 size={19} />
            </div>
          </div>
        </section>
        <section className="public-section" id="solutions">
          <div className="section-label">
            <span className="eyebrow">THREE CONNECTED SOLUTIONS</span>
            <h2>Built around the questions that matter.</h2>
            <p>Not more dashboards. A clearer path from a problem to an accountable next step.</p>
          </div>
          <div className="solution-grid">
            {[
              {
                icon: Pill,
                n: '01',
                title: 'Medicine availability',
                text: 'Anticipate stockouts, inspect usable inventory, evaluate baseline forecasts, and review feasible redistribution proposals.',
                tags: ['Stock coverage', 'Forecast evaluation', 'Human review'],
              },
              {
                icon: Landmark,
                n: '02',
                title: 'Public finance flows',
                text: 'Connect budgets, releases, procurement, and expenditure. Find reconciliation gaps without conflating financial events.',
                tags: ['Currency-safe totals', 'Bottleneck rules', 'Evidence trail'],
              },
              {
                icon: Scale,
                n: '03',
                title: 'Intervention prioritisation',
                text: 'Compare delivery packages under explicit budget, capacity, geographic, and equity constraints. Make trade-offs visible.',
                tags: ['Exact allocation', 'Scenario comparison', 'Sensitivity analysis'],
              },
            ].map((s) => (
              <article key={s.n}>
                <div>
                  <s.icon size={26} />
                  <span>{s.n}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <ul>
                  {s.tags.map((t) => (
                    <li key={t}>
                      <CheckCircle2 size={14} />
                      {t}
                    </li>
                  ))}
                </ul>
                <button onClick={enter}>
                  Explore in the demo <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section platform-section" id="platform">
          <div>
            <span className="eyebrow">ONE COHERENT WORKSPACE</span>
            <h2>
              From the first question
              <br />
              to the next informed action.
            </h2>
            <p>
              Six core modules share the same projects, validated evidence, approval records, and
              governance controls.
            </p>
            <Button onClick={enter}>
              Open the workspace <ArrowRight size={16} />
            </Button>
          </div>
          <div className="module-list">
            {[
              [Layers3, 'Problem Scoping', 'Frame testable development challenges.'],
              [FlaskConical, 'Experiment Lab', 'Compare methods and preserve results.'],
              [Database, 'Data Intelligence', 'Validate, catalogue, and understand inputs.'],
              [Workflow, 'Programme Operations', 'Connect alerts to owners and action.'],
              [BookOpen, 'Learning Academy', 'Build practical, responsible AI capability.'],
              [ShieldCheck, 'Responsible AI', 'Keep people accountable and decisions traceable.'],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Database;
              return (
                <div key={String(title)}>
                  <I size={22} />
                  <div>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="responsibility-section" id="responsibility">
          <ShieldCheck size={38} />
          <div>
            <span className="eyebrow">RESPONSIBLE BY DESIGN</span>
            <h2>
              AI should explain the evidence.
              <br />
              People should own the decision.
            </h2>
            <p>
              Deterministic calculations. Evaluated forecasts. Explicit assumptions. No autonomous
              funding or medicine transfers. The demo works without an external AI key and clearly
              labels its local assistant.
            </p>
          </div>
          <Link to="/guide" className="btn btn-secondary">
            Read the approach <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="public-demo-note">
          <FlaskConical size={23} />
          <div>
            <h3>A safe place to explore.</h3>
            <p>
              All demonstration countries, facilities, financial records and intervention
              assumptions are synthetic. No real government, patient, or partner data is
              represented. No client endorsements or impact claims are made.
            </p>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <Logo />
        <span>AI decision intelligence for development systems.</span>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/guide">Documentation</Link>
          <a href="https://github.com/rccgregion/AFRISCOPE-AI" target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
    </div>
  );
}
export function SignIn() {
  const [params] = useSearchParams();
  const invite = params.get('token');
  const [mode, setMode] = useState(invite ? 'accept' : 'login'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message] = useState('');
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Logo light />
        <div>
          <span className="eyebrow">EVIDENCE BEFORE ACTION</span>
          <h1>
            Make room for
            <br />
            better decisions.
          </h1>
          <p>
            A connected workspace for development priorities, operational intelligence, and
            accountable human review.
          </p>
        </div>
        <span>
          <ShieldCheck size={17} />
          Private workspaces. Explicit permissions.
        </span>
      </div>
      <div className="auth-main">
        <Link to="/welcome" className="text-button">
          ← Back to product overview
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            <LockKeyhole size={25} />
          </span>
          <h2>
            {mode === 'accept'
              ? 'Accept your invitation'
              : mode === 'recovery'
                ? 'Recover your access'
                : 'Welcome to AfriScope AI'}
          </h2>
          <p>
            {mode === 'accept'
              ? 'Set up your account to join your organisation.'
              : mode === 'recovery'
                ? 'Secure access recovery requires identity verification.'
                : 'Sign in to your organisation’s decision workspace.'}
          </p>
          {error && <Notice tone="warning">{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {mode === 'recovery' ? (
            <>
              <Notice>
                Email recovery is not configured. Contact your organisation administrator to verify
                your identity and reset access. No email will be sent by this demo.
              </Notice>
              <Button variant="secondary" onClick={() => setMode('login')}>
                Return to sign in
              </Button>
            </>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError('');
                try {
                  if (mode === 'accept') {
                    await api('/auth/accept-invite', {
                      body: {
                        token: invite,
                        full_name: f.get('full_name'),
                        username: f.get('username') || undefined,
                        password: f.get('password'),
                      },
                    });
                    location.assign('/');
                  } else {
                    await api('/auth/login', { body: Object.fromEntries(f) });
                    location.assign('/');
                  }
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {mode === 'accept' && (
                <>
                  <label className="form-field">
                    <span>Full name</span>
                    <input name="full_name" required autoComplete="name" />
                  </label>
                  <label className="form-field">
                    <span>Username (optional)</span>
                    <input
                      name="username"
                      autoComplete="username"
                      minLength={3}
                      maxLength={32}
                      placeholder="e.g. declareola"
                    />
                  </label>
                </>
              )}
              <label className="form-field">
                <span>{mode === 'accept' ? 'Email address' : 'Username or email'}</span>
                <input
                  name={mode === 'accept' ? 'email' : 'identifier'}
                  type={mode === 'accept' ? 'email' : 'text'}
                  required
                  autoComplete={mode === 'accept' ? 'email' : 'username'}
                  readOnly={mode === 'accept'}
                  placeholder={
                    mode === 'accept'
                      ? 'Email bound to invitation'
                      : 'declareola or you@organisation.org'
                  }
                />
              </label>
              <label className="form-field">
                <span>{mode === 'accept' ? 'Create password (12+ characters)' : 'Password'}</span>
                <input
                  name="password"
                  type="password"
                  minLength={mode === 'accept' ? 12 : 1}
                  required
                  autoComplete={mode === 'accept' ? 'new-password' : 'current-password'}
                />
              </label>
              <Button busy={busy}>
                {mode === 'accept' ? 'Create account' : 'Sign in'}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {mode === 'login' && (
            <>
              <button className="text-button mt-4" onClick={() => setMode('recovery')}>
                Forgot your password?
              </button>
              <div className="auth-divider">
                <span>or explore safely</span>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('/auth/demo', { body: { role: 'programme_manager' } });
                    location.assign('/');
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                <FlaskConical size={17} />
                Enter synthetic demo workspace
              </Button>
              <p className="auth-note">
                Demo records are fictional. Private organisation data is not accessible through demo
                entry.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export function Guide() {
  return (
    <div className="guide-page">
      <header>
        <Logo />
        <Link className="btn btn-secondary" to="/">
          Open workspace <ArrowUpRight size={15} />
        </Link>
      </header>
      <main>
        <span className="eyebrow">PRODUCT & DEVELOPER GUIDE</span>
        <h1>From evidence to accountable action.</h1>
        <p className="guide-lead">
          A practical guide to the AfriScope AI demonstration environment.
        </p>
        <Notice tone="warning">
          All demo records are synthetic. This application supports decisions; it does not replace
          local verification, legal review, or authorised human approval.
        </Notice>
        <div className="guide-grid">
          {[
            {
              title: '1. Choose a project',
              text: 'Use the project selector in the header. Medicine, finance, and intervention planning each have their own connected evidence and review records.',
            },
            {
              title: '2. Inspect the data',
              text: 'Open Data Intelligence. Review source versions, the quality report, and the data dictionary. Upload the separate defect fixture to see rejected records and remediation.',
            },
            {
              title: '3. Run an analysis',
              text: 'Programme Operations recalculates stock coverage or financial bottlenecks. Data Intelligence runs a time-aware forecast comparison. Results are persisted as evidence.',
            },
            {
              title: '4. Inspect a recommendation',
              text: 'Open the Approvals tab in Operations. Review the original action, source versions, assumptions, and limitations. Submit your own proposal if needed.',
            },
            {
              title: '5. Switch to a reviewer',
              text: 'Sign out and use the sign-in page demo role selector, or the demo role control in Settings. The proposal owner cannot approve their own recommendation.',
            },
            {
              title: '6. Record a decision',
              text: 'An authorised reviewer can approve, reject, or defer with a reason. Approval never moves stock or money. Operators can record implementation and outcomes separately.',
            },
            {
              title: '7. Compare interventions',
              text: 'Open Intervention Planner. Change the budget, equity minimum, delivery window, or geographic requirements. The exact solver explains feasible and infeasible results.',
            },
            {
              title: '8. Export the evidence',
              text: 'Reports contain saved computed results and source references. Download Markdown for a report or CSV for records, quality issues, and audit history.',
            },
          ].map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
        </div>
        <h2>Developer documentation</h2>
        <p>
          Setup, architecture, security limitations, data definitions, and evaluation methodology
          are maintained with the source code.
        </p>
        <a
          className="btn btn-primary"
          href="https://github.com/rccgregion/AFRISCOPE-AI/tree/arena/bb428b97-afriscope-ai/docs"
          target="_blank"
          rel="noreferrer"
        >
          Read documentation on GitHub <ArrowUpRight size={16} />
        </a>
        <h2>Privacy & terms</h2>
        <p>
          This demonstration is provided for evaluation, without accreditation, service-level
          guarantees, or verified real-world impact claims. Do not upload personal, patient,
          confidential, or unlawfully obtained data. See the repository SECURITY.md and Responsible
          AI documentation before deployment.
        </p>
      </main>
    </div>
  );
}
