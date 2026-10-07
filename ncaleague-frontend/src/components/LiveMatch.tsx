import { RunningMatch } from 'api/types';
import GoalBlue from 'src/assets/goal_blue.png';
import GoalRed from 'src/assets/goal_red.png';
import { useLocation } from 'wouter';

const LiveMatch = (match: RunningMatch): React.JSX.Element => {
  const [, setLocation] = useLocation();
  const players = [
    {
      name: match.players?.blueDefensive?.name ?? 'Unknown',
      position: 'blueDefensive',
      score: match.players?.blueDefensive?.score ?? 0,
    },
    {
      name: match.players?.redOffensive?.name ?? 'Unknown',
      position: 'redOffensive',
      score: match.players?.redOffensive?.score ?? 0,
    },
    {
      name: match.players?.blueOffensive?.name ?? 'Unknown',
      position: 'blueOffensive',
      score: match.players?.blueOffensive?.score ?? 0,
    },
    {
      name: match.players?.redDefensive?.name ?? 'Unknown',
      position: 'redDefensive',
      score: match.players?.redDefensive?.score ?? 0,
    },
  ];

  return (
    <div
      className="flex w-full cursor-pointer justify-center sm:w-[500px]"
      onClick={() => setLocation(`/matches/${match.id}`)}
    >
      <div className="bg-nca-blue flex w-full flex-col items-center overflow-hidden rounded-xl px-6 py-4">
        <h1 className="mb-2 text-4xl text-white uppercase">
          {match.location} {match.blueScore} : {match.redScore}
        </h1>
        <p className="text-1xl mb-3 text-white uppercase">
          Match {match.matchOfGame} of {match.mode?.[0] ?? 'unknown'}
        </p>
        <img src={GoalBlue} alt="GoalBlue" className="mb-2 h-auto w-12 rotate-180" />
        <div className="grid w-full grid-cols-2 gap-5 p-4 uppercase">
          {players.map((player, index) => (
            <div
              key={`${player.name}_${player.position}`}
              className={`flex flex-col content-center justify-center rounded-lg ${
                index % 2 === 0 ? 'bg-blue-500' : 'bg-red-500'
              }`}
            >
              <img
                src="https://static.thenounproject.com/png/3270-200.png"
                alt=""
                className="mx-auto mt-8 h-12 w-12 sm:mt-16 md:mt-20 md:h-20 md:w-20"
              />
              <p className="truncate px-3 text-center text-xl sm:text-3xl md:text-4xl">{player.name}</p>
              <p className="mx-auto mb-8 text-3xl sm:mb-16 sm:text-5xl md:mb-20 md:text-6xl">{player.score}</p>
            </div>
          ))}
        </div>
        <img src={GoalRed} alt="GoalRed" className="my-2 h-auto w-12 rotate-180" />
      </div>
    </div>
  );
};

export default LiveMatch;
