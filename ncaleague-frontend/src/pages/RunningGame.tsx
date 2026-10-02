import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { API_URL } from 'src/App';
import GoalBlue from 'src/assets/goal_blue.png';
import GoalRed from 'src/assets/goal_red.png';

export default function RunningGame(): React.JSX.Element {
  const [players, setPlayer] = useState<Array<{ name: string; position: string }>>([]);
  const [playerScores, setPlayerScores] = useState<Array<{ player: string; goals: number }>>([]);
  const [totalGoalsTeamBlue, setTotalGoalsTeamBlue] = useState<number>(0);
  const [totalGoalsTeamRed, setTotalGoalsTeamRed] = useState<number>(0);
  const [matchInfo, setMatchInfo] = useState<{ totalMatches: number; currentMatch: number }>({
    totalMatches: 0,
    currentMatch: 0,
  });
  const [, setLocation] = useLocation();
  const params = useParams();
  const matchId = params.matchId;

  useEffect(() => {
    const fetchLiveMatch = async (): Promise<void> => {
      if (matchId) {
        const res = await fetch(`${API_URL}/matches/${matchId}`);
        if (res.ok) {
          const data = await res.json();

          setMatchInfo({ totalMatches: data.totalMatches, currentMatch: data.matchOfGame });

          setPlayer([
            { name: data.players.blueDefensive.name, position: 'blueDefensive' },
            { name: data.players.redOffensive.name, position: 'redOffensive' },
            { name: data.players.blueOffensive.name, position: 'blueOffensive' },
            { name: data.players.redDefensive.name, position: 'redDefensive' },
          ]);

          setTotalGoalsTeamBlue(data.blueScore);
          setTotalGoalsTeamRed(data.redScore);

          setPlayerScores([
            { player: data.players.blueDefensive.name, goals: data.players.blueDefensive.score },
            { player: data.players.redOffensive.name, goals: data.players.redOffensive.score },
            { player: data.players.blueOffensive.name, goals: data.players.blueOffensive.score },
            { player: data.players.redDefensive.name, goals: data.players.redDefensive.score },
          ]);
        } else {
          alert('This match does not exist, close this pop-up to return to the main page.');
          setLocation('/');
        }
      }
    };
    fetchLiveMatch();
  }, [matchId, setLocation]);

  const goalCount = async (scoringPlayer: string): Promise<void> => {
    const res = await fetch(API_URL + `/matches/${matchId}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scoringPlayer: scoringPlayer }),
    });
    if (res.status == 403) {
      alert("This match is already done, can't score any goals!");
    } else if (res.ok) {
      const data = await res.json();
      if (data.newMatch === true) {
        const matchRes = await fetch(API_URL + '/matches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ gameId: data.gameId }),
        });
        if (matchRes.ok) {
          const matchData = await matchRes.json();
          const matchId = matchData.id;
          setLocation(`/matches/${matchId}`);
          setPlayerScores([]);
        }
      } else {
        setTotalGoalsTeamBlue(data.blueScore);
        setTotalGoalsTeamRed(data.redScore);

        setPlayerScores([
          { player: data.players.blueDefensive.name, goals: data.players.blueDefensive.score },
          { player: data.players.redOffensive.name, goals: data.players.redOffensive.score },
          { player: data.players.blueOffensive.name, goals: data.players.blueOffensive.score },
          { player: data.players.redDefensive.name, goals: data.players.redDefensive.score },
        ]);

        if (data.matchStatus == 'done') {
          setLocation(`/games/${data.gameId}/summary`);
        }
      }
    }
  };

  const undoGoal = async (): Promise<void> => {
    const res = await fetch(`${API_URL}/matches/${matchId}/goals/undo`, {
      method: 'POST',
    });

    if (res.status == 403) {
      alert("This match is already done, can't undo any goals!");
    } else if (res.ok && res.status != 204) {
      const data = await res.json();

      if (data.id !== matchId) {
        setLocation(`/matches/${data.id}`);
      }

      setPlayerScores([
        { player: data.players.blueDefensive.name, goals: data.players.blueDefensive.score },
        { player: data.players.redOffensive.name, goals: data.players.redOffensive.score },
        { player: data.players.blueOffensive.name, goals: data.players.blueOffensive.score },
        { player: data.players.redDefensive.name, goals: data.players.redDefensive.score },
      ]);

      setTotalGoalsTeamBlue(data.scoreTeamBlue);
      setTotalGoalsTeamRed(data.scoreTeamRed);
    }
  };

  const abortGame = async (): Promise<void> => {
    const confirmation = confirm('Are you sure that you want to abort this game?');
    if (confirmation) {
      const res = await fetch(`${API_URL}/matches/${matchId}`, {
        method: 'DELETE',
      });
      if (res.status === 204) {
        setLocation('/');
      } else {
        alert('Failed to abort game, try again.');
      }
    } else {
      return;
    }
  };

  const getGoalCountsByPlayer = (player: { name: string; position: string }): number => {
    return playerScores.find((playerGoals) => playerGoals.player === player.name)?.goals ?? 0;
  };

  return (
    <div className="flex h-full justify-center p-3 md:p-6">
      <div className="flex h-full w-full flex-col items-center justify-evenly rounded-xl bg-nca-blue px-1 py-2 2xl:py-8">
        <div className="mb-2 flex flex-col items-center text-center 2xl:mb-5">
          <h1 className="mb-2 text-7xl uppercase text-white 2xl:mb-8 2xl:text-9xl">
            {totalGoalsTeamBlue} : {totalGoalsTeamRed}
          </h1>
          <h2 className="mb-2 text-xl uppercase text-white sm:text-xl 2xl:mb-3 2xl:text-3xl">
            Match {matchInfo?.currentMatch} of {matchInfo?.totalMatches ?? 'unknown'}
          </h2>
          <p>Goal Blue</p>
          <img src={GoalBlue} alt="GoalBlue" className="w-12 rotate-180 md:w-16 2xl:w-24" />
        </div>
        <div className="grid h-full w-full cursor-pointer grid-cols-2 gap-3 p-4 text-3xl uppercase sm:gap-5 md:w-[700px]">
          {players.map((player, index) => (
            <div
              key={`${player.name}_${player.position}`}
              className={`w-45/100 sm:w-30/100 md:w-2/10 flex h-full flex-col content-center justify-center rounded-lg py-5 ${
                index % 2 === 0 ? 'bg-blue-500' : 'bg-red-500'
              }`}
              onClick={() => player.name !== undefined && goalCount(player.name)}
            >
              <img
                src="https://static.thenounproject.com/png/3270-200.png"
                alt=""
                className="mx-auto h-12 w-12 md:h-14 md:w-14 2xl:h-20 2xl:w-20"
              />
              <p className="truncate px-3 text-center text-xl sm:text-3xl 2xl:text-4xl">{player.name}</p>
              <p className="mx-auto text-3xl sm:text-5xl 2xl:text-6xl">{getGoalCountsByPlayer(player)}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center text-center">
          <img src={GoalRed} alt="GoalRed" className="mt-2 w-12 rotate-180 md:w-16 2xl:mt-5 2xl:w-24" />
          <p className="mb-2 2xl:mb-5">Goal Red</p>
          <div className="flex items-center gap-x-2 2xl:flex-col">
            <button
              className="flex w-fit cursor-pointer rounded-md bg-white p-2 text-xl sm:text-2xl 2xl:text-3xl"
              onClick={() => undoGoal()}
            >
              <img src="https://cdn-icons-png.flaticon.com/512/60/60690.png" alt="" className="h-6 w-6 sm:h-8 sm:w-8" />
              <p className="ml-2">Undo Goal</p>
            </button>
            <button
              className="flex w-fit cursor-pointer rounded-md bg-white p-2 text-xl sm:text-2xl 2xl:mt-2 2xl:text-3xl"
              onClick={() => abortGame()}
            >
              <img
                src="https://cdn-icons-png.flaticon.com/512/1828/1828778.png"
                alt=""
                className="h-6 w-6 sm:h-8 sm:w-8"
              />
              <p className="ml-2">Abort Game</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
