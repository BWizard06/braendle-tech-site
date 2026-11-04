import { useEffect, useRef, useState } from 'react';
import { clipDetails, type ClipCategory, type StudioClip } from '../../lib/avatar/clips';
import type { AvatarPlayer, Playback, StudioView } from '../../lib/avatar/player';
import type { Locale } from '../../lib/i18n';

export default function BenStudio({ locale }: { locale: Locale }) {
  const de = locale === 'de';
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<AvatarPlayer | null>(null);
  const [clips, setClips] = useState<StudioClip[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ClipCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<StudioView>('body');
  const [loop, setLoop] = useState(false);
  const [inPlace, setInPlace] = useState(true);
  const [bones, setBones] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playback, setPlayback] = useState<Playback>({ index: 0, time: 0, duration: 0, playing: false });

  useEffect(() => {
    let cancelled = false;
    let instance: AvatarPlayer | undefined;
    setStatus('loading');
    setProgress(0);
    setLoop(false); setInPlace(true); setBones(false); setSpeed(1); setView('body');
    void import('../../lib/avatar/player').then(async ({ createAvatarPlayer }) => {
      if (cancelled || !host.current) return;
      instance = await createAvatarPlayer(host.current, {
        url: '/models/ben-animated.glb',
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onProgress: value => { if (!cancelled) setProgress(value); },
        onReady: list => { if (!cancelled) { setClips(list); setStatus('ready'); } },
        onPlayback: state => { if (!cancelled) setPlayback(state); },
        onError: () => { if (!cancelled) setStatus('error'); },
      });
      if (cancelled) instance.dispose();
      else player.current = instance;
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; instance?.dispose(); player.current = null; };
  }, [attempt]);

  const ready = status === 'ready';
  const active = clips[playback.index];
  const activeLabel = active ? clipDetails(active.name, locale).label : 'Ben';
  const featured = ['greet_04', 'bow', 'dance_06', 'clap', 'walk', 'run', 'flip', 'jump_down', 'wait'];
  const ordered = [...clips].sort((a, b) => {
    const rank = (name: string) => featured.includes(name) ? featured.indexOf(name) : featured.length;
    return rank(a.name) - rank(b.name);
  });
  const visible = ordered.filter(clip => {
    const info = clipDetails(clip.name, locale);
    return (filter === 'all' || info.category === filter) &&
      `${info.label} ${clip.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
  });
  const categories: [ClipCategory | 'all', string][] = [
    ['all', de ? 'Alle' : 'All'], ['gestures', de ? 'Gesten' : 'Gestures'],
    ['movement', de ? 'Bewegung' : 'Movement'], ['emotions', de ? 'Emotionen' : 'Emotions'],
    ['play', de ? 'Freizeit' : 'Play'],
  ];
  const changeView = (next: StudioView) => { setView(next); player.current?.setView(next); };

  return <div className="ben-studio" data-studio-status={status} data-active-clip={active?.name}>
    <section className="ben-stage" aria-label={de ? 'Interaktive 3D-Ansicht von Ben' : 'Interactive 3D view of Ben'}>
      <div className="ben-stage__top">
        <span className="ben-stage__badge"><span aria-hidden="true" /> {de ? 'Ben in 3D' : 'Ben in 3D'}</span>
        <span className="ben-stage__edition">01 / CHARACTER STUDY</span>
      </div>
      <div ref={host} className="ben-stage__canvas" />
      {status === 'loading' && <div className="ben-stage__message" role="status">
        <span className="ben-stage__loader" aria-hidden="true">b.</span>
        <p>{de ? 'Ben macht sich bereit.' : 'Ben is getting ready.'}</p>
        <progress value={progress} max={100} aria-label={de ? 'Modell wird geladen' : 'Loading model'} />
        <small>{progress < 100 ? `${Math.round(progress)} %` : de ? 'Ein kleiner Moment …' : 'Just a moment …'}</small>
      </div>}
      {status === 'error' && <div className="ben-stage__message" role="alert">
        <p>{de ? 'Die 3D-Ansicht konnte nicht geladen werden.' : 'The 3D view could not be loaded.'}</p>
        <small>{de ? 'Prüfe deine Verbindung und ob dein Browser WebGL unterstützt.' : 'Check your connection and whether your browser supports WebGL.'}</small>
        <button className="ben-button" onClick={() => setAttempt(value => value + 1)}>{de ? 'Noch einmal versuchen' : 'Try again'}</button>
      </div>}
      <div className="ben-stage__bottom">
        <p className="ben-stage__hint">{de ? 'Ziehen zum Drehen · Zoomen mit Scrollen oder zwei Fingern' : 'Drag to orbit · Scroll or pinch to zoom'}</p>
        <div className="ben-view" role="group" aria-label={de ? 'Kameraansicht' : 'Camera view'}>
          <button disabled={!ready} aria-pressed={view === 'body'} onClick={() => changeView('body')}>{de ? 'Ganzkörper' : 'Full body'}</button>
          <button disabled={!ready} aria-pressed={view === 'portrait'} onClick={() => changeView('portrait')}>{de ? 'Nahansicht' : 'Close-up'}</button>
          <button disabled={!ready} aria-label={de ? 'Kamera zurücksetzen' : 'Reset camera'} title={de ? 'Kamera zurücksetzen' : 'Reset camera'} onClick={() => player.current?.setView(view)}>↺</button>
        </div>
      </div>
    </section>

    <aside className="ben-library" aria-labelledby="ben-library-title">
      <div className="ben-library__heading">
        <div><p className="ben-eyebrow">{de ? 'Du gibst den Impuls' : 'You make the move'}</p><h2 id="ben-library-title">{de ? 'Was macht Ben?' : 'What’s Ben up to?'}</h2></div>
        <span className="ben-count" aria-label={de ? `${clips.length} Animationen` : `${clips.length} animations`}>{ready ? String(clips.length).padStart(2, '0') : '—'}</span>
      </div>
      <label className="ben-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <span className="ben-sr-only">{de ? 'Animationen suchen' : 'Search animations'}</span>
        <input type="search" placeholder={de ? 'Eine Bewegung finden …' : 'Find a movement …'} value={query} onChange={event => setQuery(event.target.value)} disabled={!ready} />
      </label>
      <div className="ben-filters" role="group" aria-label={de ? 'Animationen filtern' : 'Filter animations'}>
        {categories.map(([category, label]) => <button key={category} aria-pressed={filter === category} onClick={() => setFilter(category)}>{label}</button>)}
      </div>
      <div className="ben-clips" aria-label={de ? 'Animationsauswahl' : 'Animation selection'}>
        {visible.map(clip => <button key={`${clip.index}:${clip.name}`} className="ben-clip" data-clip={clip.name} aria-pressed={playback.index === clip.index} disabled={!ready} onClick={() => player.current?.play(clip.index)}>
          <span className="ben-clip__number" aria-hidden="true">{String(ordered.indexOf(clip) + 1).padStart(2, '0')}</span>
          <span className="ben-clip__label">{clipDetails(clip.name, locale).label}</span>
          <span className="ben-clip__duration">{clip.duration.toFixed(1)} s</span>
          <span className="ben-clip__play" aria-hidden="true">↗</span>
        </button>)}
        {ready && !visible.length && <p className="ben-empty">{de ? 'Keine passende Bewegung gefunden.' : 'No matching movement found.'}</p>}
        {!ready && <p className="ben-empty">{de ? 'Die Bewegungen erscheinen, sobald Ben bereit ist.' : 'The movements will appear when Ben is ready.'}</p>}
      </div>
      <p className="ben-library__note">{de ? 'Ein Klick, eine andere Seite von mir.' : 'One click. A different side of me.'}</p>
    </aside>

    <section className="ben-player" aria-label={de ? 'Animationssteuerung' : 'Animation controls'}>
      <div className="ben-player__current">
        <button className="ben-player__play" disabled={!ready} aria-label={playback.playing ? (de ? 'Animation pausieren' : 'Pause animation') : (de ? 'Animation abspielen' : 'Play animation')} onClick={() => player.current?.toggle()}>
          {playback.playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="3" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7Z" fill="currentColor" /></svg>}
        </button>
        <div><span className="ben-eyebrow">{playback.playing ? (de ? 'In Bewegung' : 'Now playing') : (de ? 'Momentaufnahme' : 'A moment in time')}</span><p aria-live="polite" aria-atomic="true">{activeLabel}</p></div>
        <button className="ben-player__restart" disabled={!ready} aria-label={de ? 'Animation neu starten' : 'Restart animation'} title={de ? 'Animation neu starten' : 'Restart animation'} onClick={() => player.current?.play(playback.index)}>↺</button>
      </div>
      <div className="ben-player__timeline">
        <label className="ben-sr-only" htmlFor="ben-timeline">{de ? 'Animationsposition' : 'Animation position'}</label>
        <input id="ben-timeline" type="range" min={0} max={playback.duration || 1} step={0.01} value={playback.time} disabled={!ready} aria-valuetext={`${playback.time.toFixed(1)} / ${playback.duration.toFixed(1)} ${de ? 'Sekunden' : 'seconds'}`} onChange={event => player.current?.seek(Number(event.target.value))} />
        <div className="ben-player__time"><span>{playback.time.toFixed(1)} s</span><span>{playback.duration.toFixed(1)} s</span></div>
      </div>
      <label className="ben-speed"><span>{de ? 'Tempo' : 'Speed'}</span><select aria-label={de ? 'Tempo' : 'Speed'} disabled={!ready} value={speed} onChange={event => { const value = Number(event.target.value); setSpeed(value); player.current?.setSpeed(value); }}>
        {[0.25, 0.5, 0.75, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
      </select></label>
    </section>

    <div className="ben-options">
      <label><input type="checkbox" checked={loop} disabled={!ready} onChange={event => { setLoop(event.target.checked); player.current?.setLoop(event.target.checked); }} />{de ? 'Wiederholen' : 'Repeat'}</label>
      <label title={de ? 'Hält Ben horizontal in der Mitte. Sprünge bleiben erhalten.' : 'Keeps Ben horizontally centred. Jumps are preserved.'}><input type="checkbox" checked={inPlace} disabled={!ready} onChange={event => { setInPlace(event.target.checked); player.current?.setInPlace(event.target.checked); }} />{de ? 'Auf der Stelle' : 'In place'}</label>
      <label><input type="checkbox" checked={bones} disabled={!ready} onChange={event => { setBones(event.target.checked); player.current?.setSkeleton(event.target.checked); }} />{de ? 'Skelett zeigen' : 'Show skeleton'}</label>
      <span>{de ? 'Noch im Werden. Schon voller Bewegung.' : 'Still taking shape. Already full of life.'}</span>
    </div>
  </div>;
}
