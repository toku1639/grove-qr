import { useEffect, useState } from 'react';
import { TreeSection } from './sections/TreeSection';
import { BuildingSection } from './sections/BuildingSection';
import { BrandMark, BuildingIcon, CloseIcon, MenuIcon, TreeNavIcon } from './ui/icons';

export type AppSection = 'tree' | 'building';

const SECTIONS: readonly {
  id: AppSection;
  label: string;
  note: string;
  Icon: () => React.ReactElement;
}[] = [
  { id: 'tree', label: '木', note: '季節と気候のツリー', Icon: TreeNavIcon },
  { id: 'building', label: '建物', note: '一軒家・タワー・神社', Icon: BuildingIcon },
];

export default function App() {
  const [section, setSection] = useState<AppSection>('tree');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="chrome">
        <button
          className="chrome__menu"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="section-drawer"
          aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <div className="chrome__brand" aria-hidden="true">
          <BrandMark />
          <span className="chrome__titles">
            <span className="chrome__name">Morphing QR</span>
            <span className="chrome__section">
              {section === 'tree' ? 'Tree' : 'Building'}
            </span>
          </span>
        </div>
      </header>

      {menuOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="メニューを閉じる"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <nav
        id="section-drawer"
        className={menuOpen ? 'drawer is-open' : 'drawer'}
        aria-hidden={!menuOpen}
      >
        <p className="drawer__label">セクション</p>
        {SECTIONS.map(({ id, label, note, Icon }) => (
          <button
            key={id}
            className={section === id ? 'drawer__item is-active' : 'drawer__item'}
            type="button"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => {
              setSection(id);
              setMenuOpen(false);
            }}
          >
            <Icon />
            <span className="drawer__text">
              <span className="drawer__title">{label}</span>
              <span className="drawer__note">{note}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="section-host" key={section}>
        {section === 'tree' ? <TreeSection /> : <BuildingSection />}
      </div>
    </div>
  );
}
