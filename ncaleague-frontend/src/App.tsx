import React from 'react';
import Games from 'src/pages/Games';
import NewGame from 'src/pages/NewGame';
import { Route } from 'wouter';
import RunningGame from 'src/pages/RunningGame';
import Ranking from 'src/pages/Ranking';
import PostGame from 'src/pages/PostGame';

export const API_URL = import.meta.env.VITE_API_URL;

const App = (): React.JSX.Element => {
  return (
    <div className="h-screen">
      <Route path="/games" component={Games} />
      <Route path="/" component={NewGame} />
      <Route path="/matches/:matchId" component={RunningGame} />
      <Route path="/ranking" component={Ranking} />
      <Route path="/games/:gameId/summary" component={PostGame} />
    </div>
  );
};

export default App;
