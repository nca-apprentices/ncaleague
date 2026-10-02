interface GamesPaginationProps {
  postsPerPage: number;
  totalPosts: number;
  setCurrentPage: (page: number) => void;
  currentPage: number;
}

export const GamesPagination: React.FC<GamesPaginationProps> = ({
  postsPerPage,
  totalPosts,
  setCurrentPage,
  currentPage,
}) => {
  const totalPages = Math.ceil(totalPosts / postsPerPage);
  const pageNumbers: (number | string)[] = [];

  if (totalPages < 10) {
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    pageNumbers.push(1);

    if (currentPage > 3) {
      pageNumbers.push('...');
    }

    const startPage = Math.max(2, currentPage - 1);
    const endPage = Math.min(totalPages - 1, currentPage + 1);

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    if (currentPage < totalPages - 2) {
      pageNumbers.push('...');
    }
    pageNumbers.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between gap-2">
      {currentPage > 1 && (
        <button className="rounded bg-gray-300 px-3 py-1" onClick={() => setCurrentPage(currentPage - 1)}>
          Previous
        </button>
      )}
      {pageNumbers.map((item, index) =>
        typeof item === 'number' ? (
          <button
            key={index}
            className={`rounded px-3 py-1 ${currentPage === item ? 'bg-nca-blue text-white' : 'bg-gray-300'}`}
            onClick={() => setCurrentPage(item)}
          >
            {item}
          </button>
        ) : (
          <span key={index} className="px-2">
            {item}
          </span>
        ),
      )}
      {currentPage < totalPages && (
        <button className="rounded bg-gray-300 px-3 py-1" onClick={() => setCurrentPage(currentPage + 1)}>
          Next
        </button>
      )}
    </div>
  );
};
