import { TreeSection } from './sections/TreeSection';
import { BrandMark } from './ui/icons';

export default function App() {
  return (
    <div className="app-shell">
      <header className="chrome">
        <div className="chrome__brand" aria-hidden="true">
          <BrandMark />
          <span className="chrome__titles">
            <span className="chrome__name">GroveQR</span>
            <span className="chrome__section">3D Code</span>
          </span>
        </div>
      </header>

      <div className="section-host">
        <TreeSection />
      </div>
    </div>
  );
}
