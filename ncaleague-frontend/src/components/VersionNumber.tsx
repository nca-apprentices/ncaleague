import packageJson from 'package.json';

export default function VersionNumber(): React.JSX.Element {
  return <p className="p-4 text-sm italic text-gray-500 sm:text-base sm:text-white">v{packageJson.version}</p>;
}
