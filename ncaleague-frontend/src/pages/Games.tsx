import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from 'src/App';
import { GamesPagination } from 'src/components/GamesPagination';
import NavigationBar from 'src/components/NavigationBar';
import { Match } from 'api/types';

const Games = (): React.JSX.Element => {
  const [matches, setMatches] = useState<Match[]>([]);

  const [currentPage, setCurrentPage] = useState(1);

  const timeOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Zurich',
  };

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      const response = await fetch(`${API_URL}/matches`, {
        method: 'GET',
      });

      if (response?.status === 200) {
        const body = await response.json();
        setMatches(body);
      }
    };

    fetchData();
  }, []);

  type MatchWithRowColor = Match & {
    rowColor: 'bg-gray-50' | 'bg-zinc-200';
  };

  const matchesWithRowColors = useMemo(() => {
    let gameId: string = '';
    let rowColor: 'bg-gray-50' | 'bg-zinc-200' = 'bg-gray-50';

    return matches.map((match: Match): MatchWithRowColor => {
      if (gameId !== match.gameId) {
        gameId = match.gameId;
        rowColor = rowColor === 'bg-gray-50' ? 'bg-zinc-200' : 'bg-gray-50';
      }
      return {
        ...match,
        rowColor,
      };
    });
  }, [matches]);

  const postsPerPage = 20;
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentMatches = matchesWithRowColors.slice(indexOfFirstPost, indexOfLastPost);

  return (
    <>
      <NavigationBar disableKey={'Games'} />
      <div className="flex flex-col items-center p-3 pb-20 md:p-8">
        <div className="grid grid-cols-1 items-center justify-items-center gap-4 overflow-auto rounded-lg bg-white p-6 shadow-lg md:w-4/5">
          <h1 className="my-10 text-center text-4xl">Games</h1>
          <div className="w-full overflow-scroll sm:overflow-scroll md:overflow-auto">
            <table className="w-full table-fixed rounded-lg border border-gray-400 max-lg:w-[1000px]">
              <thead>
                <tr>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Start Date</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Mode</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Blue Offensive</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Blue Defensive</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Red Offensive</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Red Defensive</th>
                  <th className="border-b border-r border-gray-400 px-4 py-2">Winning Team</th>
                </tr>
              </thead>
              <tbody>
                {currentMatches?.map((match: MatchWithRowColor, index) => {
                  return (
                    <tr key={index} className={`text-center ${match.rowColor}`}>
                      <td className="border-b border-r border-gray-400 px-4 py-2">
                        {new Intl.DateTimeFormat('en-GB', timeOptions).format(new Date(match.startDate))}
                      </td>
                      <td className="border-b border-r border-gray-400 px-4 py-2">{match.mode}</td>
                      <td className="truncate border-b border-r border-gray-400 px-4 py-2">
                        {match.blueOffensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-400 px-4 py-2">
                        {match.blueDefensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-400 px-4 py-2">
                        {match.redOffensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-400 px-4 py-2">
                        {match.redDefensive.toUpperCase()}
                      </td>
                      <td className="border-b border-r border-gray-400 px-4 py-2">
                        {match.winningTeam === 'red' ? 'Red' : match.winningTeam === 'blue' ? 'Blue' : 'Not finished'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <GamesPagination
            postsPerPage={postsPerPage}
            totalPosts={matches.length}
            setCurrentPage={setCurrentPage}
            currentPage={currentPage}
          />
        </div>
      </div>
    </>
  );
};

export default Games;
