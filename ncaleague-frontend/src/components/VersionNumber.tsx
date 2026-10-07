// The release tag the image was built from, or dev outside a release build.
export default function VersionNumber(): React.JSX.Element {
  return (
    <p className="p-4 text-sm text-gray-500 italic sm:text-base sm:text-white">
      {import.meta.env.VITE_VERSION ?? 'dev'}
    </p>
  );
}
