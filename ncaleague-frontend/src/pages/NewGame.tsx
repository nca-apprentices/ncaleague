import React, { useState, useEffect, useMemo } from 'react';
import { API_URL } from 'src/App';
import { Player, RunningMatch } from 'api/types/';
import LiveMatch from 'src/components/LiveMatch';
import NavigationBar from 'src/components/NavigationBar';
import { Tooltip } from 'react-tooltip';
import { saveGameToken } from 'src/gameToken';

export default function NewGame(): React.JSX.Element {
  const [location, setLocation] = useState('Zurich');
  const [gameMode, setGameMode] = useState('4-5');
  const [playerName, setPlayerName] = useState('');
  const [playersList, setPlayersList] = useState<Array<Player>>([]);
  const [suggestions, setSuggestions] = useState<Array<Player>>([]);
  const [liveMatches, setLiveMatches] = useState<Array<RunningMatch>>([]);
  const [playersToCreate, setPlayersToCreate] = useState<string[]>([]);
  const [isButtonDisabled, setIsButtonDisabled] = useState(true);
  const [isNewPlayer, setIsNewPlayer] = useState(false);

  useEffect(() => {
    const fetchPlayers = async (): Promise<void> => {
      const response = await fetch(API_URL + '/players');
      const data = await response.json();
      setPlayersList(data);
    };

    fetchPlayers();
  }, []);

  useEffect(() => {
    const setLiveMatchesStateByGettingAllLiveMatchesFromBackend = async (): Promise<void> => {
      const arrayOfLiveMatches = await fetch(`${API_URL}/matches/live`);
      const data = await arrayOfLiveMatches.json();
      setLiveMatches(data);
    };
    setLiveMatchesStateByGettingAllLiveMatchesFromBackend();
    const intervalId = setInterval(setLiveMatchesStateByGettingAllLiveMatchesFromBackend, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const filteredNames = useMemo((): string[] => {
    return playerName
      .replace(/,/g, ' ')
      .split(' ')
      .filter((e) => e !== '')
      .filter(Boolean);
  }, [playerName]);

  const duplicates = useMemo(() => {
    const duplicatePlayerNames: string[] = [];

    const alreadySeenNames: string[] = [];

    filteredNames.forEach((name) => {
      name = name.toLowerCase();
      if (alreadySeenNames.includes(name)) {
        duplicatePlayerNames.push(name);
      } else {
        alreadySeenNames.push(name);
      }
    });

    return duplicatePlayerNames;
  }, [filteredNames]);

  useEffect(() => {
    setIsNewPlayer(false);
    setPlayersToCreate(() => []);

    if (filteredNames.length === 4) {
      for (const name of filteredNames) {
        const playerExists = playersList.some(
          (player) => player.name && player.name.toLowerCase() === name.toLowerCase(),
        );
        if (!playerExists) {
          setIsNewPlayer(true);
          setPlayersToCreate((prev) => [...prev, name]);
        }
      }
    }
  }, [filteredNames, playersList]);

  useEffect(() => {
    setIsButtonDisabled(filteredNames.length != 4 || duplicates.length != 0);
  }, [playerName, filteredNames.length, duplicates.length]);

  const handleGameModeChange = (e: { target: { value: string } }): void => {
    setGameMode(e.target.value);
  };

  const handleLocationChange = (e: { target: { value: string } }): void => {
    setLocation(e.target.value);
  };

  const handlePlayerNameChange = (e: { target: { value: string } }): void => {
    const newName = e.target.value;
    setPlayerName(newName);

    if (filteredNames.length > 4) {
      setPlayerName(filteredNames.slice(0, 4).join(', '));
      return;
    }

    const latestName = filteredNames.length > 0 ? filteredNames[filteredNames.length - 1].toLowerCase() : '';
    const filteredSuggestions = playersList
      .filter((player) => player.name && player.name.toLowerCase().startsWith(latestName))
      .slice(0, 3);

    if (filteredSuggestions.length !== 1) {
      setSuggestions(filteredSuggestions);
    } else {
      setSuggestions([]);
    }

    if (playerName.trim() === '') {
      setSuggestions([]);
    } else {
      setSuggestions(filteredSuggestions);
    }
  };

  const handleSuggestionClick = (name: string): void => {
    if (filteredNames.length > 1) {
      filteredNames.pop();
      filteredNames.push(name);

      setPlayerName(filteredNames.slice(0, 4).join(', '));
    } else {
      setPlayerName(name);
    }
  };

  const handleStartGame = async (): Promise<void> => {
    const newPlayers = filteredNames.filter(
      (name) => !playersList.some((player) => player.name && player.name.toLowerCase() === name.toLowerCase()),
    );

    for (const playerName of newPlayers) {
      await fetch(API_URL + '/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });
    }

    const updatedPlayersResponse = await fetch(API_URL + '/players');
    const updatedPlayersList = await updatedPlayersResponse.json();

    const playerIds = filteredNames.map(
      (name) =>
        updatedPlayersList.find((player: { name: string }) => player.name.toLowerCase() === name.toLowerCase())?.name,
    );

    if (playerIds.some((name) => name === undefined)) {
      console.error('Player was not found');
      return;
    }

    const match = {
      location: location,
      mode: gameMode,
      players: filteredNames,
    };

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
      saveGameToken(matchData.gameId, matchData.token);

      window.location.href = `/matches/${matchId}`;
    } else {
      console.error('Failed to start the game');
    }
  };

  const buttonClass = isButtonDisabled ? 'bg-gray-300' : 'bg-nca-blue';

  return (
    <>
      <NavigationBar disableKey={'New Game'} />
      <div className="p-3 pb-20 md:p-8">
        <h1 className="my-10 text-center text-4xl">New Game</h1>
        <div className="flex flex-col items-center">
          <div className="grid w-full grid-cols-1 items-center justify-items-start gap-4 md:w-2/5 2xl:w-1/5">
            <p className="text-xl">Location: </p>
            <select
              className="border-nca-blue w-full border p-2"
              name="location"
              value={location}
              onChange={handleLocationChange}
            >
              <option value="Zurich">Zurich</option>
              <option value="Winterthur">Winterthur</option>
            </select>
            <p className="text-xl">Game Mode: </p>
            <select
              className="border-nca-blue w-full border p-2"
              name="gameMode"
              value={gameMode}
              onChange={handleGameModeChange}
            >
              <option value="4-5">4 to 5</option>
              <option value="3-5">3 to 5</option>
              <option value="1-10">1 to 10</option>
            </select>
            <p className="text-xl">Players: </p>
            <input
              type="text"
              name="name"
              placeholder="Shortsign of 4 players separated by commas, e.g., ab, cd, ef, gh"
              value={playerName}
              onChange={handlePlayerNameChange}
              className="border-nca-blue w-full rounded-md border p-2"
              data-tooltip-id="suggestions"
              data-tooltip-place="top"
              data-tooltip-content={`${isNewPlayer ? `Player(s) ${playersToCreate.join(', ')} not found!` : ''}`}
              onKeyDown={(e) => (e.key === 'Enter' && !isButtonDisabled ? handleStartGame() : null)}
            />
            <Tooltip id="suggestions" isOpen={isNewPlayer} variant="warning" />
            {isNewPlayer && (
              <div className="w-fit rounded-md bg-yellow-500 p-2 text-white">
                Players that are not found will be created on the database
              </div>
            )}
            {duplicates.length >= 1 &&
              (duplicates.length == 1 ? (
                <div className="w-fit rounded-md bg-yellow-500 p-2 text-white">
                  Player name {duplicates} was written more than once!
                </div>
              ) : (
                <div className="w-fit rounded-md bg-yellow-500 p-2 text-white">
                  Player names {duplicates.join(', ')} were written more than once!
                </div>
              ))}
            {suggestions.length > 0 && playerName.trim() !== '' && (
              <div className="w-full text-center">
                <div className="text-nca-blue mb-2 rounded-md bg-blue-50 p-2 text-xl font-bold">Suggestions:</div>
                <ul>
                  {suggestions.map((suggestion, index) =>
                    index < 3 ? (
                      <li
                        key={suggestion.name}
                        className="truncate text-xl"
                        onClick={() => handleSuggestionClick(suggestion.name)}
                      >
                        {suggestion.name}
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            )}
            <button
              className={`${buttonClass} h-12 w-full rounded-full px-10 py-2 text-white`}
              onClick={handleStartGame}
              disabled={isButtonDisabled}
            >
              Start Game
            </button>
          </div>
        </div>
        <h1 className="my-10 text-center text-4xl">Live Games</h1>
        <div className="flex flex-wrap justify-center gap-6 p-6">
          {liveMatches.map((match, index) => (
            <LiveMatch key={match.gameId || index} {...match} />
          ))}
        </div>
      </div>
    </>
  );
}
