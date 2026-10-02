export const determineWinningTeam = (goalsTeamBlue: number, goalsTeamRed: number): string => {
  if (goalsTeamBlue > goalsTeamRed) {
    return 'blue';
  } else if (goalsTeamRed > goalsTeamBlue) {
    return 'red';
  } else {
    return '';
  }
};

export const getNumberOfMatches = (matchMode: string): number => {
  return parseInt(matchMode.split('-')[0]);
};

export const getMaxScoreCount = (matchMode: string): number => {
  return parseInt(matchMode.split('-')[1]);
};
