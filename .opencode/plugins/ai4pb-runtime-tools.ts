import decomposeGoal from '../tools/decompose_goal';
import generateGapReport from '../tools/generate_gap_report';
import generateTestCases from '../tools/generate_test_cases';
import queryGraph from '../tools/query_graph';
import readProjectStatus from '../tools/read_project_status';
import runRealityScanner from '../tools/run_reality_scanner';
import updateGraphModel from '../tools/update_graph_model';

export const id = 'ai4pb-runtime-tools';

export async function server() {
  return {
    tool: {
      decompose_goal: decomposeGoal,
      generate_gap_report: generateGapReport,
      generate_test_cases: generateTestCases,
      query_graph: queryGraph,
      read_project_status: readProjectStatus,
      run_reality_scanner: runRealityScanner,
      update_graph_model: updateGraphModel,
    },
  };
}

export default {
  id,
  server,
};