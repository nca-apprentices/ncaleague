// The release tag the image was built from, or dev outside a release build.
export default function VersionNumber(): React.JSX.Element {
  return (
    <p className="p-4 text-sm italic text-gray-500 sm:text-base sm:text-white">
      {import.meta.env.VITE_VERSION ?? 'dev'}
    </p>
  );
}
