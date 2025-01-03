
const customText = {
  短剧: {
    嘟嘟剧场: "@DUDUJUCHANG",
    蜜糖短剧: "@mitangduanju",
    剧多多: "@DramaPlus-99",
    古风好剧: "@GUgooddrama",
    甜梦剧场: "@Sweet-Dream-drama",
    奈奈剧场: "@nainai125",
    甜甜追短劇: "@TT-drama",
    下山追短剧: "@XiashanDrama",
    月亮短剧社: "@user-moon-drama-club",
    百万好剧场: "@1-pw5ox",
    指间看剧: "@FingertipsTV1",
    小穎美食: "@XiaoYingFood",
    李子柒Liziqi: "@cnliziqi",
    纪实说: "@C-Documentary",
  },
  综艺: {
    腾讯热综: "@TencentVideoShow",
    综艺Show: "@C-HitShow",
    浙江卫视奔跑吧: "@KeepRunningChina",
    纪实风云: "@纪实风云",
  },
};




const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.95 Safari/537.36';

function encodeChinese(text) {
  return text.replace(/[\u4e00-\u9fa5]/g, (match) => {
    return encodeURIComponent(match);
  });
}
//获取影视列表
async function categoryContent(tid, pg = 1, extend) {
  const backData = new RepVideo();
  try {
    let { channelId, order = '最新' } = extend ? JSON.parse(extend) : { channelId: '', order: '最新' };
    if (!channelId && customText[tid]) {
      const channelIds = Object.values(customText[tid]);
      if (channelIds.length > 0) {
        channelId = channelIds[0]; // 取第一个值
      } else {
        throw new Error(`未找到与 tid "${tid}" 对应的频道列表`);
      }
    }
    let continuation='';
    if(pg == 1) {
      const initialResponse = await req(`https://www.youtube.com/${encodeChinese(channelId)}/videos`, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
      });
      if (!initialResponse.ok) {
        throw new Error(`HTTP error! status: ${initialResponse.status}`);
      }
      const initialData = await initialResponse.text();
      const regex = new RegExp(`"simpleText":"${order}".*?"token":"([^"]+)"`, "s");
      const match = initialData.match(regex);
      if (!match) {
        console.log("未找到匹配的 continuation");
        return JSON.stringify(backData);
      }
      continuation = match[1];
    }else{
      continuation = await getStorage('continuation_'+ channelId);
      if (!continuation) {
        console.log("未找到 continuation");
        return JSON.stringify(backData);
      }
    }

    const continuationResponse = await req('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/${encodeChinese(channelId)}/videos`,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20241230.09.00"
          }
        },
        continuation
      })
    });
    if (!continuationResponse.ok) {
      throw new Error(`HTTP error! status: ${continuationResponse.status}`);
    }
    const resData = await continuationResponse.text();
    const continuationData = JSON.parse(resData);
    let token='';
    const videos = [];
    if (continuationData.onResponseReceivedActions && continuationData.onResponseReceivedActions.length > 0) {
      let contents;
      if (continuationData.onResponseReceivedActions[1]?.reloadContinuationItemsCommand) {
          contents = continuationData.onResponseReceivedActions[1].reloadContinuationItemsCommand.continuationItems;
      } else if (continuationData.onResponseReceivedActions[0]?.appendContinuationItemsAction) {
          contents = continuationData.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems;
      } else {
          console.error('No continuation items found');
          return JSON.stringify(backData);
      }
      contents.forEach(item => {
        if (item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
          token = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
          console.log("continuation token:", token);
      }

        if (item.richItemRenderer?.content?.videoRenderer) {
          const video = item.richItemRenderer.content.videoRenderer;
          const videoId = video.videoId;
          const title = video.title.runs[0].text;
          const thumbnails = video.thumbnail.thumbnails;
          const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : null;
          const duration = video.lengthText ? video.lengthText.simpleText : '未知时长';
          const videoDet = new VideoList();
          videoDet.vod_id = videoId+ "||" +title + "||" + thumbnail + "||" + duration;
          videoDet.vod_pic = thumbnail;
          videoDet.vod_name = title.trim();
          videoDet.vod_remarks = duration.trim();
          videos.push(videoDet);
        }
      });
    }
    await setStorage('continuation_'+ channelId, token);
    backData.list = videos;
  } catch (error) {
    console.error('Error in fetchData:', error);
    backData.msg = error.statusText || error.message;
  }
  console.log(JSON.stringify(backData));
  return JSON.stringify(backData);
}

// 分类数据模板
const filterTemplate = {
  order: {
    name: "排序",
    value: [
      { n: "最新", v: "最新" },
      { n: "最热门", v: "最热门" },
      { n: "最早", v: "最早" }
    ]
  }
};

function generateKeywordFilter(subCategories) {
  return {
    key: "channelId",
    name: "分类",
    value: [
      ...Object.keys(subCategories).map(subKey => ({
        n: subKey,
        v: subCategories[subKey] || subKey // 如果值为空，则取键名
      }))
    ]
  };
}

//homeContent();

//获取首页分类
async function homeContent() {
  let backData = new RepVideo();
  let filterData;
  let classes;
    classes = Object.keys(customText).map(category => ({
      type_name: category,
      type_id: category
    }));
    filterData = {};
    Object.keys(customText).forEach(category => {
      const keywordFilter = generateKeywordFilter(customText[category]);
      filterData[category] = [keywordFilter];
      filterData[category].push(
        { key: "order", name: "排序", value: filterTemplate.order.value }
      );
    });
  backData.class = classes;
  backData.filters = filterData;
  console.log(JSON.stringify(backData));
  return JSON.stringify(backData);
}

//searchContent("抖音神曲");

async function searchContent(keyword) {
  let backData = new RepVideo();
  try {
      let pro = await req('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
          method: 'POST',
          headers: {
              'User-Agent': UA,
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              "context": {
                  "client": {
                      "clientName": "WEB",
                      "clientVersion": "2.20241230.09.00"
                  }
              },
              "query": keyword
          })
      });
      let proData = await pro.json();
      console.log(proData);

      // 假设API返回的数据结构中有视频信息
      let videos = [];
      if (proData.contents && proData.contents.twoColumnSearchResultsRenderer && proData.contents.twoColumnSearchResultsRenderer.primaryContents && proData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer && proData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents) {
          proData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents.forEach(section => {
              if (section.itemSectionRenderer && section.itemSectionRenderer.contents) {
                  section.itemSectionRenderer.contents.forEach(item => {
                      if (item.videoRenderer) {
                          let video = item.videoRenderer;
                          let videoId = video.videoId;
                          let title = video.title.runs[0].text;
                          const thumbnails = video.thumbnail.thumbnails;
                          const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : null;
                          let duration = video.lengthText ? video.lengthText.simpleText : 'N/A';

                          let videoDet = new VideoList();
                          videoDet.vod_id = videoId+ "||" +title + "||" + thumbnail + "||" + duration;
                          videoDet.vod_pic = thumbnail;
                          videoDet.vod_name = title;
                          videoDet.vod_remarks = duration;
                          videos.push(videoDet);
                      }
                  });
              }
          });
      }

      backData.list = videos;
  } catch (error) {
      console.error('Error in fetchData:', error);
      backData.msg = error.statusText;
  }
  console.log(JSON.stringify(backData));
  return JSON.stringify(backData);
}
async function detailContent(ids) {
  let backData = new RepVideo();
  let detModel = new VideoDetail()
  const [vod_id,vod_name,vod_pic,vod_remarks] = ids.split("||");
  detModel.vod_id=ids;
  detModel.vod_name = vod_name;
  detModel.vod_pic = vod_pic;
  detModel.vod_content = vod_name;
  detModel.vod_year = '';
  detModel.vod_remarks = vod_remarks;
  detModel.vod_play_from = '播放列表';
  detModel.vod_actor = '';
  detModel.vod_director = '';
  detModel.vod_area = '';
  let vod_play_url = '在线播放$' + vod_id;
  detModel.vod_play_url =vod_play_url;
  backData.list.push(detModel);
  console.log(JSON.stringify(backData));
  return JSON.stringify(backData);
}



//playerContent('Qs0Pt45xy8Q')

async function playerContent(vod_id) {
  let backData = new RepVideoPlayUrl();
  let youtubeUrl = `https://www.youtube.com/watch?v=${vod_id}`;
  const maxRetries = 5; // 最大重试次数
  const retryDelay = 1000; // 重试间隔时间（毫秒）

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await toast('正在分析youtube直链...', 2);
      const API_BASE_URL = "https://youtube.iiilab.com";
      const GTimestamp = Date.now().toString().slice(0, 13);
      const GFooter = Crypto.MD5(`${youtubeUrl}youtube${GTimestamp}2HT8gjE3xL`).toString();
      let res = await req(`${API_BASE_URL}/api/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "G-Footer": GFooter,
          "G-Timestamp": GTimestamp,
          "Origin": API_BASE_URL,
          "Referer": `${API_BASE_URL}/`,
          "User-Agent": UA,
          "X-Forwarded-For": generateChineseIP()
        },
        body: JSON.stringify({
          link: youtubeUrl,
          site: "youtube"
        })
      });
      const apiResponse = await res.text();
      console.log("API 响应:", apiResponse);

      let highestQualityVideo = null;
      let highestQualityAudio = null;
      let maxQuality = -1;

      try {
        const mediaData = JSON.parse(apiResponse); // 解析 JSON
        if (mediaData.medias && Array.isArray(mediaData.medias)) {
          mediaData.medias.forEach(media => {
            if (media.media_type === "video" && media.formats && Array.isArray(media.formats)) {
              media.formats.forEach(format => {
                if (format.quality > maxQuality) {
                  maxQuality = format.quality;
                  highestQualityVideo = format.video_url;
                  highestQualityAudio = format.audio_url;
                }
              });
            }
          });
        }

        if (highestQualityVideo && highestQualityAudio) {
          await toast(`解析完毕，尝试播放...`, 2);
          console.log("最高质量的视频 URL:", highestQualityVideo);
          console.log("最高质量的音频 URL:", highestQualityAudio);
          console.log("质量:", maxQuality);
          backData.audioUrl = highestQualityAudio;
          backData.url = highestQualityVideo;
          backData.header = headersToString({ 'User-Agent': UA });
          backData.parse = 1;
          console.log(JSON.stringify(backData));
          return JSON.stringify(backData);
        } else {
          console.log(`第 ${attempt} 次尝试未找到有效的视频或音频 URL`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待1秒后重试
          }
        }
      } catch (parseError) {
        console.error(`第 ${attempt} 次尝试解析 API 响应失败:`, parseError);
        await toast(`第 ${attempt} 次尝试解析 API 响应失败`, 2);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待1秒后重试
        }
      }
    } catch (error) {
      console.error(`第 ${attempt} 次尝试发生错误:`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待1秒后重试
      }
    }
  }

  console.log("已达到最大重试次数，未能获取有效的视频或音频 URL");
  return '';
}


function generateChineseIP() {
  function isPrivateIP(ipParts) {
    // 检查是否是私有IP地址
    const [part1, part2] = ipParts;
    if (part1 === 10) return true; // 10.x.x.x
    if (part1 === 172 && part2 >= 16 && part2 <= 31) return true; // 172.16.x.x - 172.31.x.x
    if (part1 === 192 && part2 === 168) return true; // 192.168.x.x
    return false;
  }

  let ipParts;
  do {
    // 随机生成A、B、C类地址
    const classType = Math.floor(Math.random() * 3); // 0: A类, 1: B类, 2: C类
    ipParts = [];

    if (classType === 0) {
      // A类地址：1.x.x.x 到 126.x.x.x
      ipParts.push(Math.floor(Math.random() * 126) + 1); // 第一个部分：1-126
    } else if (classType === 1) {
      // B类地址：128.x.x.x 到 191.255.x.x
      ipParts.push(Math.floor(Math.random() * (191 - 128 + 1)) + 128); // 第一个部分：128-191
    } else {
      // C类地址：192.x.x.x 到 223.255.255.x
      ipParts.push(Math.floor(Math.random() * (223 - 192 + 1)) + 192); // 第一个部分：192-223
    }

    // 生成剩余部分
    for (let i = 1; i < 4; i++) {
      ipParts.push(Math.floor(Math.random() * 256)); // 其他部分：0-255
    }
  } while (isPrivateIP(ipParts)); // 如果是私有地址，重新生成

  return ipParts.join('.');
}
