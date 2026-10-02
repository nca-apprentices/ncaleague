import React, { useState, useEffect } from 'react';
import { API_URL } from 'src/App';
import NavigationBar from 'src/components/NavigationBar';
import { Player } from 'api/types';

interface PlayerWithWinRate {
  player: Player;
  winrate: number;
  rank: number;
}

export default function PlayerNames(): React.JSX.Element {
  const [playersWithWinRates, setPlayersWithWinRates] = useState<PlayerWithWinRate[]>([]);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_URL}/players/ranking`);
        if (!response.ok) {
          throw new Error('Failed to fetch player data');
        }
        const data = await response.json();
        setPlayersWithWinRates(data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();
  }, []);

  return (
    <>
      <NavigationBar disableKey={'Ranking'} />
      <div className="p-3 pb-20 md:p-8">
        <h1 className="my-10 flex justify-center text-4xl">Ranking</h1>
        <div className="flex justify-center">
          <div className="flex w-full items-center justify-center rounded-lg bg-white p-6 shadow-lg sm:w-3/5 sm:overflow-scroll md:overflow-auto">
            <table className="w-full table-fixed rounded-lg border border-gray-300">
              <thead>
                <tr>
                  <th className="border-b border-r border-gray-300 px-4 py-2">Rank</th>
                  <th className="w-2/5 border-b border-r border-gray-300 px-4 py-2 sm:w-3/5">Name</th>
                  <th className="border-b border-gray-300 px-4 py-2">Winrate</th>
                </tr>
              </thead>
              <tbody>
                {playersWithWinRates.map(({ player, winrate, rank }, index) => (
                  <tr key={player.name} className={index % 2 === 0 ? 'bg-gray-100' : 'bg-white'}>
                    <td className="border-b border-r border-gray-300 px-4 py-2">{rank || index + 1}</td>
                    <td className="truncate border-b border-r border-gray-300 px-4 py-2">{player.name}</td>
                    <td className="border-b border-gray-300 px-4 py-2">{winrate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
