import { Link } from 'wouter';
import VersionNumber from 'src/components/VersionNumber';

export default function NavigationBar({ disableKey }: { disableKey: string }): React.JSX.Element {
  const buttons = [
    { label: 'New Game', href: '/' },
    { label: 'Ranking', href: '/ranking' },
    { label: 'Games', href: '/games' },
  ];

  return (
    <nav className="fixed bottom-0 flex w-full justify-between border-t-2 bg-white sm:static sm:border-b-2 sm:border-t-0 sm:bg-nca-blue">
      <div>
        {buttons.map(({ label, href }) => (
          <button
            key={label}
            disabled={disableKey === label}
            className="border-r border-white bg-nca-blue text-white hover:bg-slate-500 focus:bg-slate-500 active:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-80"
          >
            <Link href={href} className="block p-4">
              {label}
            </Link>
          </button>
        ))}
      </div>
      <VersionNumber />
    </nav>
  );
}
