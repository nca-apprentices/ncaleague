import React, { useState, useEffect } from 'react';
import { API_URL } from 'src/App';
import NavigationBar from 'src/components/NavigationBar';
import { Match, Player } from 'api/types';
import { useParams } from 'wouter';

export default function PostGame(): React.JSX.Element {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>();
  const [newGameMode, setNewGameMode] = useState<string>('4-5');

  const params = useParams();
  const gameId = params.gameId;

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_URL}/games/${gameId}/summary`);
        if (!response.ok) {
          throw new Error('Failed to fetch matches of game');
        }
        const data = await response.json();

        console.log(data);

        setMatches(data);
        setPlayers([data[0].blueOffensive, data[0].blueDefensive, data[0].redOffensive, data[0].redDefensive]);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();
  }, [gameId]);

  const handleGameModeChange = (e: { target: { value: string } }): void => {
    setNewGameMode(e.target.value);
  };

  const handleStartGame = async (): Promise<void> => {
    const match = {
      location: matches[0].location,
      mode: newGameMode,
      players: players,
    };

    console.log(match);
    console.log(newGameMode);

    const matchRes = await fetch(API_URL + '/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(match),
    });

    if (matchRes.ok) {
      const matchData = await matchRes.json();
      const matchId = matchData.id;

      window.location.href = `/matches/${matchId}`;
    } else {
      console.error('Failed to start the game');
    }
  };

  console.log(matches);

  return (
    <>
      <NavigationBar disableKey={''} />
      <div className="flex flex-col items-center p-3 pb-20 md:p-8">
        <div className="grid grid-cols-1 items-center justify-items-center gap-4 overflow-auto rounded-lg bg-white p-6 shadow-lg md:w-4/5">
          <h1 className="my-10 text-center text-4xl">Game Over</h1>
          <div className="w-full overflow-scroll sm:overflow-scroll md:overflow-auto">
            {matches.length == 0 ? (
              <h1>Error while showing matches, try again</h1>
            ) : (
              <table className="w-full table-fixed rounded-lg border border-gray-400 max-lg:w-[1000px]">
                <thead>
                  <tr>
                    <th className="border-b border-r border-gray-300 px-4 py-2">Match No.</th>
                    <th className="border-b border-r border-gray-300 px-4 py-2">Blue Offensive</th>
                    <th className="border-b border-r border-gray-300 px-4 py-2">Blue Defensive</th>
                    <th className="border-b border-r border-gray-300 px-4 py-2">Red Offensive</th>
                    <th className="border-b border-r border-gray-300 px-4 py-2">Red Defensive</th>
                    <th className="border-b border-gray-300 px-4 py-2">Winning Team</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(({ blueOffensive, blueDefensive, redOffensive, redDefensive, winningTeam }, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-100' : 'bg-white'}>
                      <td className="border-b border-r border-gray-300 px-4 py-2">{index + 1}</td>
                      <td className="truncate border-b border-r border-gray-300 px-4 py-2">
                        {blueOffensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-300 px-4 py-2">
                        {blueDefensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-300 px-4 py-2">
                        {redOffensive.toUpperCase()}
                      </td>
                      <td className="truncate border-b border-r border-gray-300 px-4 py-2">
                        {redDefensive.toUpperCase()}
                      </td>
                      <td className="border-b border-gray-300 px-4 py-2">{winningTeam == 'blue' ? 'Blue' : 'Red'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <h1 className="my-5 flex justify-center text-4xl">Rematch</h1>
        <p className="mt-5 text-xl">Game Mode:</p>
        <select
          className="w-32 border border-nca-blue p-2"
          name="newGameMode"
          value={newGameMode}
          onChange={handleGameModeChange}
        >
          <option value="4-5">4 to 5</option>
          <option value="3-5">3 to 5</option>
          <option value="1-10">1 to 10</option>
        </select>
        <button className="mt-5 rounded-lg bg-nca-blue p-3 text-white" onClick={handleStartGame}>
          Rematch
        </button>
      </div>
    </>
  );
}
