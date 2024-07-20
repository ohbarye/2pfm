javascript: (function () {
  let pageNum = 0;
  let output = {};

  function parseHistory(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");

    // 注文点数から総ページ数を求める
    const itemNumStr = doc
      .getElementsByClassName("num-orders")[0]
      .textContent.replace(/[件,]/, "");
    pageNum = Math.ceil(Number(itemNumStr.replace(/,/, "")) / 10);

    // 注文毎に処理
    const orders = doc.getElementsByClassName(
      "a-box-group a-spacing-base order"
    );
    [...orders].forEach((order) => {
      const orderId = order
        .getElementsByClassName("a-color-secondary value")[2]
        .textContent.trim();
      // TODO: try before you buyやkindle unlimitedなどの注文は構造が異なり、orderIdでなく注文日が取れてしまうので一旦スキップ
      if (orderId.length !== 19) return;

      const orderDate = order
        .getElementsByClassName("a-color-secondary value")[0]
        .textContent.trim();
      const orderPriceStr = order
        .getElementsByClassName("a-color-secondary value")[1]
        .textContent.replace(/[￥ ,]/g, "");
      const orderPrice = Number(orderPriceStr) | 0;

      // 「注文日」と「ご請求額」は先に取得
      output[orderId] = {
        orderId,
        orderDate,
        orderPrice,
      };
    });
  }

  function parseDetail(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    try {
      const detail = {};
      const orderId = doc.getElementsByTagName("bdi")[0].textContent.trim();

      const itemEles = doc.getElementById("od-subtotals")
        ? doc.getElementById("od-subtotals").querySelectorAll("[class=a-row]")
        : doc
            .getElementsByClassName("a-fixed-right-grid-col a-col-right")[0]
            .querySelectorAll("[class=a-row]");

      [...itemEles].forEach((item) => {
        const key = item.getElementsByTagName("span")[0].textContent.trim();
        const val = item
          .getElementsByTagName("span")[1]
          .textContent.trim()
          .replace(/[￥ ,]/g, "");
        detail[key] = val;
      });
      output[orderId] = { ...output[orderId], ...detail };
    } catch {}

    try {
      const orderId = doc.getElementsByTagName("bdi")[0].textContent.trim();
      const orderDate = doc
        .getElementsByClassName("order-date-invoice-item")[0]
        .textContent.trim()
        .replace("注文日 ", "");

      const itemEles = doc.getElementsByClassName("yohtmlc-item");
      [...itemEles].forEach((item) => {
        const name = item
          .getElementsByClassName("a-link-normal")[0]
          .textContent.trim();
        const price = item
          .getElementsByClassName("a-color-price")[0]
          .textContent.trim()
          .replace(/[￥ ,]/g, "");
        const num =
          item.parentElement
            .getElementsByClassName("item-view-qty")[0]
            ?.textContent.trim() ?? 1;
        output[orderId]["details"] ||= [];
        output[orderId]["details"].push({
          orderId,
          orderDate,
          name,
          price,
          num,
        });
      });
    } catch {}
  }

  async function calcPrice() {
    const reqUrl =
      "https://www.amazon.co.jp/gp/css/order-history?disableCsd=no-js&orderFilter=months-3";
    const text = await (await fetch(reqUrl)).text();
    parseHistory(text);

    if (pageNum > 1) {
      const reqUrls = [...Array(pageNum - 1).keys()].map(
        (i) =>
          "https://www.amazon.co.jp/gp/css/order-history?disableCsd=no-js&orderFilter=months-3&startIndex=" +
          (i + 1) * 10
      );
      await Promise.all(reqUrls.map((u) => fetch(u)))
        .then((responses) => Promise.all(responses.map((res) => res.text())))
        .then((texts) => {
          texts.forEach((text) => parseHistory(text));
        });
    }

    // 注文詳細を取得する
    const reqUrls = Object.keys(output).map(
      (orderId) =>
        `https://www.amazon.co.jp/gp/your-account/order-details?orderID=${orderId}`
    );
    await Promise.all(reqUrls.map((u) => fetch(u)))
      .then((responses) => Promise.all(responses.map((res) => res.text())))
      .then((texts) => {
        texts.forEach((text) => parseDetail(text));
      });
  }

  // 日付ごとにグループ化し、降順にソートする関数
  function groupAndSortByDate(orders) {
    // オブジェクトを配列に変換
    const orderArray = Object.entries(orders).map(([id, order]) => ({
      id,
      ...order,
    }));

    // 日付でグループ化
    const groupedOrders = orderArray.reduce((acc, order) => {
			// TODO: SKUが取れない場合はスキップ
			if (!order.details) return acc;

      const date = order.orderDate;
      if (!acc[date]) {
        acc[date] = [];
			}
      acc[date].push(order);
      return acc;
    }, {});

    // 日付で降順にソート
    const sortedDates = Object.keys(groupedOrders).sort((a, b) => {
      return (
        new Date(b.replace(/年|月|日/g, "")) -
        new Date(a.replace(/年|月|日/g, ""))
      );
    });

    // 結果を整形
		const result = sortedDates.reduce((acc, date) => {
			if (!groupedOrders[date]) return acc; // 同日のSKUが取れない場合はスキップ
      acc[date] = groupedOrders[date];
      return acc;
    }, {});

    return result;
  }

  calcPrice().then(() => {
    console.log(groupAndSortByDate(output));
    let newWindow = window.open("", "name", "height=800,width=400");
    newWindow.location = "https://7sg889-5173.csb.app/";
  });
})();
