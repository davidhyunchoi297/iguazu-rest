import merge from 'deepmerge';

import * as types from '../types';
import { buildFetchUrl } from '../helpers/url';
import config from '../config';
import { waitAndDispatchFinished } from './asyncSideEffects';

function startsWith(string, target) {
  return String(string).slice(0, target.length) === target;
}

async function extractDataFromResponse(res) {
  const contentType = res.headers.get('Content-Type');
  const isJson = startsWith(contentType, 'application/json');
  const body = await res[isJson ? 'json' : 'text']();
  const { status } = res;

  return res.ok ?
    Promise.resolve(body) :
    Promise.reject(Object.assign(new Error(`${res.statusText} (${res.url})`), { body, status }));
}

const actionTypeMethodMap = {
  LOAD: 'GET',
  LOAD_COLLECTION: 'GET',
  CREATE: 'POST',
  UPDATE: 'PUT',
  DESTROY: 'DELETE',
};

async function getAsyncData({ resource, id, opts, actionType, state }) {
  const { resources, defaultOpts, baseFetch } = config;
  const { url, opts: resourceOpts } = resources[resource].fetch(id, actionType, state);

  const fetchOpts = merge.all([
    { method: actionTypeMethodMap[actionType] },
    defaultOpts || {},
    resourceOpts || {},
    opts || {},
  ]);
  const fetchUrl = buildFetchUrl({ url, id, opts: fetchOpts });

  const res = await baseFetch(fetchUrl, fetchOpts);
  const rawData = await extractDataFromResponse(res);
  const { transformData } = config.resources[resource];
  const data = transformData ? transformData(rawData, { id, opts, actionType }) : rawData;

  return data;
}

export default function executeFetch({ resource, id, opts, actionType }) {
  return (dispatch, getState) => {
    const promise = getAsyncData({ resource, id, opts, actionType, state: getState() });
    dispatch({ type: types[`${actionType}_STARTED`], resource, id, opts, promise });
    dispatch(waitAndDispatchFinished(promise, { type: types[`${actionType}_FINISHED`], resource, id, opts }));

    return promise;
  };
}
